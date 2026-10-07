import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { gunzip } from "node:zlib";

const unzip = promisify(gunzip);
const githubApiVersion = "2022-11-28";
const maximumArchiveBytes = 50 * 1024 * 1024;
const maximumExtractedBytes = 250 * 1024 * 1024;
const maximumEntries = 20_000;
const githubRequestTimeoutMs = 120_000;

export interface GitHubRepository {
  owner: string;
  name: string;
  canonicalUrl: string;
}

export interface FetchedRepository extends GitHubRepository {
  commitSha: string;
  directoryPath: string;
}

export function parseGitHubRepositoryUrl(value: string): GitHubRepository {
  let url: URL;

  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("Enter a valid GitHub repository URL");
  }

  if (
    url.protocol !== "https:" ||
    url.hostname.toLowerCase() !== "github.com" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error("Repository URL must be a public https://github.com URL");
  }

  const parts = url.pathname.split("/").filter(Boolean);
  if (parts.length !== 2) {
    throw new Error("Repository URL must name one GitHub owner and repository");
  }

  const owner = parts[0];
  const name = parts[1].replace(/\.git$/u, "");
  const validPart = /^[A-Za-z0-9_.-]+$/u;
  if (!owner || !name || !validPart.test(owner) || !validPart.test(name)) {
    throw new Error("Repository URL contains an invalid owner or repository name");
  }

  return {
    owner,
    name,
    canonicalUrl: `https://github.com/${owner.toLowerCase()}/${name.toLowerCase()}`,
  };
}

export async function withFetchedRepository<T>(
  repositoryUrl: string,
  handleRepository: (repository: FetchedRepository) => Promise<T>,
): Promise<T> {
  const repository = parseGitHubRepositoryUrl(repositoryUrl);
  const temporaryDirectory = await fs.mkdtemp(path.join(tmpdir(), "repolens-"));

  try {
    const metadata = await fetchJson(
      `https://api.github.com/repos/${repository.owner}/${repository.name}`,
    );
    const defaultBranch = readString(metadata, "default_branch");
    const commit = await fetchJson(
      `https://api.github.com/repos/${repository.owner}/${repository.name}/commits/${encodeURIComponent(defaultBranch)}`,
    );
    const commitSha = readString(commit, "sha");
    const archive = await fetchBytes(
      `https://codeload.github.com/${repository.owner}/${repository.name}/tar.gz/${commitSha}`,
    );
    const repositoryDirectory = path.join(temporaryDirectory, "repository");

    await fs.mkdir(repositoryDirectory);
    await extractTar(await unzip(archive), repositoryDirectory);

    return await handleRepository({
      ...repository,
      commitSha,
      directoryPath: repositoryDirectory,
    });
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await githubFetch(url);
  return response.json();
}

async function fetchBytes(url: string): Promise<Buffer> {
  const response = await githubFetch(url);
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumArchiveBytes) {
    throw new Error("Repository archive exceeds the 50 MB download limit");
  }
  if (!response.body) throw new Error("GitHub returned an empty repository archive");

  const chunks: Uint8Array[] = [];
  const reader = response.body.getReader();
  let length = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > maximumArchiveBytes) {
        throw new Error("Repository archive exceeds the 50 MB download limit");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks, length);
}

async function githubFetch(url: string): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "RepoLens",
        "X-GitHub-Api-Version": githubApiVersion,
      },
      redirect: "follow",
      signal: AbortSignal.timeout(githubRequestTimeoutMs),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new Error("GitHub request timed out after 120 seconds");
    }
    throw error;
  }

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("GitHub repository was not found or is not public");
    }
    throw new Error(`GitHub request failed with status ${response.status}`);
  }

  return response;
}

function readString(value: unknown, key: string): string {
  if (!value || typeof value !== "object") {
    throw new Error("GitHub returned an unexpected response");
  }
  const field = Reflect.get(value, key);
  if (typeof field !== "string" || !field) {
    throw new Error(`GitHub response did not include ${key}`);
  }
  return field;
}

async function extractTar(archive: Buffer, destination: string): Promise<void> {
  let offset = 0;
  let entryCount = 0;
  let extractedBytes = 0;
  let archiveRoot: string | undefined;
  let nextPath: string | undefined;

  while (offset + 512 <= archive.length) {
    const header = archive.subarray(offset, offset + 512);
    offset += 512;
    if (header.every((byte) => byte === 0)) break;

    entryCount += 1;
    if (entryCount > maximumEntries) {
      throw new Error("Repository archive contains more than 20,000 entries");
    }

    const size = readTarNumber(header.subarray(124, 136));
    const type = String.fromCharCode(header[156] || 48);
    const bodyEnd = offset + size;
    if (bodyEnd > archive.length) throw new Error("GitHub returned a truncated archive");
    const body = archive.subarray(offset, bodyEnd);
    offset += Math.ceil(size / 512) * 512;

    const name = nextPath ?? readTarPath(header);
    nextPath = undefined;
    if (type === "x") {
      nextPath = readPaxPath(body);
      continue;
    }
    if (type === "g") continue;
    if (type === "L") {
      nextPath = readText(body).replace(/\0+$/u, "");
      continue;
    }

    const parts = name.split("/").filter(Boolean);
    if (parts.length === 0) continue;
    archiveRoot ??= parts[0];
    if (parts[0] !== archiveRoot) {
      throw new Error("Repository archive contains multiple top-level directories");
    }
    if (parts.length === 1) continue;

    const relativePath = parts.slice(1).join("/");
    const outputPath = safeArchivePath(destination, relativePath);
    if (type === "5") {
      await fs.mkdir(outputPath, { recursive: true });
      continue;
    }
    if (type !== "0" && type !== "\0") continue;

    extractedBytes += size;
    if (extractedBytes > maximumExtractedBytes) {
      throw new Error("Repository archive exceeds the 250 MB extracted limit");
    }
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, body);
  }
}

function readTarPath(header: Buffer): string {
  const name = readText(header.subarray(0, 100));
  const prefix = readText(header.subarray(345, 500));
  return prefix ? `${prefix}/${name}` : name;
}

function readTarNumber(value: Buffer): number {
  const text = readText(value).trim();
  const parsed = Number.parseInt(text || "0", 8);
  if (!Number.isSafeInteger(parsed) || parsed < 0) {
    throw new Error("Repository archive contains an invalid entry size");
  }
  return parsed;
}

function readText(value: Buffer): string {
  const nullIndex = value.indexOf(0);
  return value.subarray(0, nullIndex === -1 ? value.length : nullIndex).toString("utf8");
}

function readPaxPath(value: Buffer): string | undefined {
  const text = value.toString("utf8");
  let offset = 0;

  while (offset < text.length) {
    const space = text.indexOf(" ", offset);
    if (space === -1) break;
    const length = Number.parseInt(text.slice(offset, space), 10);
    if (!Number.isSafeInteger(length) || length <= 0) break;
    const record = text.slice(space + 1, offset + length - 1);
    const separator = record.indexOf("=");
    if (separator !== -1 && record.slice(0, separator) === "path") {
      return record.slice(separator + 1);
    }
    offset += length;
  }

  return undefined;
}

function safeArchivePath(destination: string, relativePath: string): string {
  if (
    relativePath.includes("\\") ||
    relativePath.split("/").some((part) => part === ".." || part === ".")
  ) {
    throw new Error("Repository archive contains an unsafe path");
  }

  const outputPath = path.resolve(destination, ...relativePath.split("/"));
  const relative = path.relative(destination, outputPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Repository archive contains a path outside its root");
  }
  return outputPath;
}
