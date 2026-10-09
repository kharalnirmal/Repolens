import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  hkdfSync,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

const credentialLifetimeSeconds = 5 * 60;
const clockToleranceSeconds = 5;
const encryptionContext = Buffer.from("repolens-agent-delegation-v1");
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type AnalysisCredentialClaims = {
  version: 1;
  issuer: "repolens";
  audience: "repolens-agent-tools";
  scope: "analysis:read";
  analysisId: string;
  organizationId: string;
  projectId: string;
  issuedAt: number;
  expiresAt: number;
  credentialId: string;
  delegation: string;
};

export type VerifiedAnalysisCredential = {
  analysisId: string;
  organizationId: string;
  projectId: string;
  expiresAt: number;
  accessToken: string;
};

export function mintAnalysisCredential(input: {
  analysisId: string;
  organizationId: string;
  projectId: string;
  accessToken: string;
}): { credential: string; expiresAt: string } {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = Math.min(
    issuedAt + credentialLifetimeSeconds,
    readAccessTokenExpiration(input.accessToken),
  );
  if (expiresAt <= issuedAt + clockToleranceSeconds) {
    throw new Error("Cannot delegate an expired access token");
  }
  const claims: AnalysisCredentialClaims = {
    version: 1,
    issuer: "repolens",
    audience: "repolens-agent-tools",
    scope: "analysis:read",
    analysisId: input.analysisId,
    organizationId: input.organizationId,
    projectId: input.projectId,
    issuedAt,
    expiresAt,
    credentialId: randomUUID(),
    delegation: encryptAccessToken(input.accessToken),
  };
  const header = encodeJson({ algorithm: "HS256", type: "RLAT", version: 1 });
  const payload = encodeJson(claims);
  const signature = sign(`${header}.${payload}`);

  return {
    credential: `${header}.${payload}.${signature}`,
    expiresAt: new Date(expiresAt * 1000).toISOString(),
  };
}

export function verifyAnalysisCredential(
  credential: string,
): VerifiedAnalysisCredential {
  const parts = credential.split(".");
  if (parts.length !== 3) throw new Error("Invalid analysis credential");
  const [headerSegment, payloadSegment, signatureSegment] = parts;
  const signedValue = `${headerSegment}.${payloadSegment}`;
  const suppliedSignature = decodeBase64Url(signatureSegment);
  const expectedSignature = decodeBase64Url(sign(signedValue));
  if (
    suppliedSignature.length !== expectedSignature.length ||
    !timingSafeEqual(suppliedSignature, expectedSignature)
  ) {
    throw new Error("Invalid analysis credential");
  }

  const header = decodeJson(headerSegment);
  if (
    !isRecord(header) ||
    header.algorithm !== "HS256" ||
    header.type !== "RLAT" ||
    header.version !== 1
  ) {
    throw new Error("Invalid analysis credential");
  }

  const claims = decodeJson(payloadSegment);
  if (!isAnalysisCredentialClaims(claims)) {
    throw new Error("Invalid analysis credential");
  }

  const now = Math.floor(Date.now() / 1000);
  if (
    claims.issuedAt > now + clockToleranceSeconds ||
    claims.expiresAt <= now ||
    claims.expiresAt <= claims.issuedAt ||
    claims.expiresAt - claims.issuedAt > credentialLifetimeSeconds
  ) {
    throw new Error("Expired analysis credential");
  }

  return {
    analysisId: claims.analysisId,
    organizationId: claims.organizationId,
    projectId: claims.projectId,
    expiresAt: claims.expiresAt,
    accessToken: decryptAccessToken(claims.delegation),
  };
}

function encryptAccessToken(accessToken: string): string {
  const initializationVector = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), initializationVector);
  cipher.setAAD(encryptionContext);
  const ciphertext = Buffer.concat([
    cipher.update(accessToken, "utf8"),
    cipher.final(),
  ]);
  return [
    initializationVector.toString("base64url"),
    ciphertext.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
  ].join(".");
}

function decryptAccessToken(delegation: string): string {
  const parts = delegation.split(".");
  if (parts.length !== 3) throw new Error("Invalid analysis credential");
  const [initializationVector, ciphertext, authenticationTag] = parts.map(
    decodeBase64Url,
  );

  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(),
      initializationVector,
    );
    decipher.setAAD(encryptionContext);
    decipher.setAuthTag(authenticationTag);
    return Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new Error("Invalid analysis credential");
  }
}

function sign(value: string): string {
  return createHmac("sha256", signingKey()).update(value).digest("base64url");
}

function signingKey(): Buffer {
  return deriveKey("repolens-agent-signing-v1");
}

function encryptionKey(): Buffer {
  return deriveKey("repolens-agent-encryption-v1");
}

function deriveKey(purpose: string): Buffer {
  const configuredSecret = process.env.REPOLENS_AGENT_CREDENTIAL_SECRET?.trim();
  if (!configuredSecret) {
    throw new Error(
      "Missing required environment variable: REPOLENS_AGENT_CREDENTIAL_SECRET",
    );
  }
  const secret = Buffer.from(configuredSecret, "base64url");
  if (secret.length !== 32) {
    throw new Error("REPOLENS_AGENT_CREDENTIAL_SECRET must encode exactly 32 bytes");
  }
  return Buffer.from(
    hkdfSync("sha256", secret, Buffer.alloc(0), purpose, 32),
  );
}

function encodeJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function decodeJson(value: string): unknown {
  try {
    return JSON.parse(decodeBase64Url(value).toString("utf8"));
  } catch {
    throw new Error("Invalid analysis credential");
  }
}

function decodeBase64Url(value: string): Buffer {
  if (!value || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("Invalid analysis credential");
  }
  return Buffer.from(value, "base64url");
}

function readAccessTokenExpiration(accessToken: string): number {
  const payloadSegment = accessToken.split(".")[1];
  if (!payloadSegment) throw new Error("Cannot delegate an invalid access token");
  const payload = decodeJson(payloadSegment);
  if (
    !isRecord(payload) ||
    typeof payload.exp !== "number" ||
    !Number.isInteger(payload.exp)
  ) {
    throw new Error("Cannot delegate an invalid access token");
  }
  return payload.exp;
}

function isAnalysisCredentialClaims(
  value: unknown,
): value is AnalysisCredentialClaims {
  return isRecord(value) &&
    value.version === 1 &&
    value.issuer === "repolens" &&
    value.audience === "repolens-agent-tools" &&
    value.scope === "analysis:read" &&
    typeof value.analysisId === "string" &&
    uuidPattern.test(value.analysisId) &&
    typeof value.organizationId === "string" &&
    value.organizationId.length > 0 &&
    value.organizationId.length <= 256 &&
    typeof value.projectId === "string" &&
    uuidPattern.test(value.projectId) &&
    typeof value.issuedAt === "number" &&
    Number.isInteger(value.issuedAt) &&
    typeof value.expiresAt === "number" &&
    Number.isInteger(value.expiresAt) &&
    typeof value.credentialId === "string" &&
    uuidPattern.test(value.credentialId) &&
    typeof value.delegation === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
