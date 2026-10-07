import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { createGunzip } from "node:zlib";

const githubApiVersion = "2022-11-28";
const maximumArchiveBytes = 50 * 1024 * 1024;
const maximumExtractedBytes = 250 * 1024 * 1024;
const maximumEntries = 20_000;
const maximumTarBytes = maximumExtractedBytes + maximumEntries * 1024;
const maximumMetadataBytes = 1024 * 1024;
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
    await extractTar(archive, repositoryDirectory);

    return await handleRepository({
      ...repository,
      commitSha,
      directoryPath: repositoryDirectory,
    });
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
}

export async function fetchCurrentRepositoryCommit(repositoryUrl: string): Promise<string> {
  const repository = parseGitHubRepositoryUrl(repositoryUrl);
  const metadata = await fetchJson(
    `https://api.github.com/repos/${repository.owner}/${repository.name}`,
  );
  const defaultBranch = readString(metadata, "default_branch");
  const commit = await fetchJson(
    `https://api.github.com/repos/${repository.owner}/${repository.name}/commits/${encodeURIComponent(defaultBranch)}`,
  );
  return readString(commit, "sha");
}

export async function fetchRepositoryFile(
  repositoryUrl: string,
  commitSha: string,
  filePath: string,
): Promise<string> {
  const repository = parseGitHubRepositoryUrl(repositoryUrl);
  if (filePath.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("Repository file path is invalid");
  }
  const encodedPath = filePath.split("/").map(encodeURIComponent).join("/");
  const response = await githubFetch(
    `https://raw.githubusercontent.com/${repository.owner}/${repository.name}/${encodeURIComponent(commitSha)}/${encodedPath}`,
  );
  return response.text();
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await githubFetch(url);
  return response.json();
}

async function fetchBytes(url: string): Promise<Buffer> {
  const response = await githubFetch(url);
  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumArchiveBytes) {
    await response.body?.cancel();
    throw new Error("Repository archive exceeds the 50 MB download limit");
  }
  if (!response.body) throw new Error("GitHub returned an empty repository archive");

  const chunks: Uint8Array[] = [];
  const reader = response.body.getReader();
  let length = 0;
  let completed = false;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        completed = true;
        break;
      }
      length += value.length;
      if (length > maximumArchiveBytes) {
        throw new Error("Repository archive exceeds the 50 MB download limit");
      }
      chunks.push(value);
    }
  } finally {
    if (!completed) await reader.cancel().catch(() => undefined);
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

async function extractTar(compressedArchive: Buffer, destination: string): Promise<void> {
  const decompressed = Readable.from([compressedArchive]).pipe(createGunzip());
  const archive = new BoundedArchiveReader(decompressed);
  let entryCount = 0;
  let extractedBytes = 0;
  let archiveRoot: string | undefined;
  let nextPath: string | undefined;

  try {
    while (true) {
      const header = await archive.readExactly(512);
      if (header === null) break;
      if (header.every((byte) => byte === 0)) {
        const terminator = await archive.readExactly(512);
        if (terminator === null || !terminator.every((byte) => byte === 0)) {
          throw new Error("GitHub returned a truncated archive");
        }
        await archive.drain();
        break;
      }

      entryCount += 1;
      if (entryCount > maximumEntries) {
        throw new Error("Repository archive contains more than 20,000 entries");
      }

      const size = readTarNumber(header.subarray(124, 136));
      const type = String.fromCharCode(header[156] || 48);

      const name = nextPath ?? readTarPath(header);
      nextPath = undefined;
      if (type === "x") {
        const body = await archive.readMetadata(size);
        nextPath = readPaxPath(body);
        await archive.skipPadding(size);
        continue;
      }
      if (type === "g") {
        const metadata = readPaxAttributes(await archive.readMetadata(size));
        if (
          metadata.has("path") ||
          metadata.has("linkpath") ||
          metadata.has("size")
        ) {
          throw new Error("Repository archive uses unsupported global metadata");
        }
        await archive.skipPadding(size);
        continue;
      }
      if (type === "L") {
        const body = await archive.readMetadata(size);
        nextPath = readText(body).replace(/\0+$/u, "");
        await archive.skipPadding(size);
        continue;
      }

      const parts = name.split("/").filter(Boolean);
      if (parts.length === 0) {
        await archive.skipEntry(size);
        continue;
      }
      archiveRoot ??= parts[0];
      if (parts[0] !== archiveRoot) {
        throw new Error("Repository archive contains multiple top-level directories");
      }
      if (parts.length === 1) {
        await archive.skipEntry(size);
        continue;
      }

      const relativePath = parts.slice(1).join("/");
      const outputPath = safeArchivePath(destination, relativePath);
      if (type === "5") {
        await fs.mkdir(outputPath, { recursive: true });
        await archive.skipEntry(size);
        continue;
      }
      if (type !== "0" && type !== "\0") {
        await archive.skipEntry(size);
        continue;
      }

      extractedBytes += size;
      if (extractedBytes > maximumExtractedBytes) {
        throw new Error("Repository archive exceeds the 250 MB extracted limit");
      }
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      const output = await fs.open(outputPath, "w");
      try {
        await archive.writeEntry(output, size);
      } finally {
        await output.close();
      }
      await archive.skipPadding(size);
    }
  } finally {
    decompressed.destroy();
  }
}

class BoundedArchiveReader {
  private readonly iterator: AsyncIterator<unknown>;
  private buffered: Buffer = Buffer.alloc(0);
  private decompressedBytes = 0;
  private ended = false;

  constructor(source: AsyncIterable<unknown>) {
    this.iterator = source[Symbol.asyncIterator]();
  }

  async readExactly(size: number): Promise<Buffer | null> {
    const chunks: Buffer[] = [];
    let remaining = size;

    while (remaining > 0) {
      const chunk = await this.take(remaining);
      if (chunk === null) {
        if (remaining === size) return null;
        throw new Error("GitHub returned a truncated archive");
      }
      chunks.push(chunk);
      remaining -= chunk.length;
    }

    return chunks.length === 1 ? chunks[0] : Buffer.concat(chunks, size);
  }

  async readMetadata(size: number): Promise<Buffer> {
    if (size > maximumMetadataBytes) {
      throw new Error("Repository archive contains oversized metadata");
    }
    const metadata = await this.readExactly(size);
    if (metadata === null && size > 0) {
      throw new Error("GitHub returned a truncated archive");
    }
    return metadata ?? Buffer.alloc(0);
  }

  async writeEntry(output: fs.FileHandle, size: number): Promise<void> {
    await this.consume(size, async (chunk) => {
      let offset = 0;
      while (offset < chunk.length) {
        const { bytesWritten } = await output.write(
          chunk,
          offset,
          chunk.length - offset,
          null,
        );
        if (bytesWritten === 0) throw new Error("Could not write repository file");
        offset += bytesWritten;
      }
    });
  }

  async drain(): Promise<void> {
    while ((await this.take(Number.MAX_SAFE_INTEGER)) !== null) {
      // Draining validates the gzip trailer without retaining decompressed data.
    }
  }

  async skipEntry(size: number): Promise<void> {
    await this.consume(size);
    await this.skipPadding(size);
  }

  async skipPadding(size: number): Promise<void> {
    const padding = (512 - (size % 512)) % 512;
    await this.consume(padding);
  }

  private async consume(
    size: number,
    onChunk?: (chunk: Buffer) => Promise<void>,
  ): Promise<void> {
    let remaining = size;
    while (remaining > 0) {
      const chunk = await this.take(remaining);
      if (chunk === null) throw new Error("GitHub returned a truncated archive");
      await onChunk?.(chunk);
      remaining -= chunk.length;
    }
  }

  private async take(maximumBytes: number): Promise<Buffer | null> {
    while (this.buffered.length === 0 && !this.ended) await this.readNextChunk();
    if (this.buffered.length === 0) return null;

    const length = Math.min(maximumBytes, this.buffered.length);
    const chunk = this.buffered.subarray(0, length);
    this.buffered = this.buffered.subarray(length);
    return chunk;
  }

  private async readNextChunk(): Promise<void> {
    const result = await this.iterator.next();
    if (result.done) {
      this.ended = true;
      return;
    }
    if (!(result.value instanceof Uint8Array)) {
      throw new Error("GitHub returned an invalid repository archive");
    }

    const chunk = Buffer.from(result.value.buffer, result.value.byteOffset, result.value.byteLength);
    this.decompressedBytes += chunk.length;
    if (this.decompressedBytes > maximumTarBytes) {
      throw new Error("Repository archive exceeds the decompressed size limit");
    }
    this.buffered = chunk;
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
  const attributes = readPaxAttributes(value);
  if (attributes.has("linkpath") || attributes.has("size")) {
    throw new Error("Repository archive uses unsupported entry metadata");
  }
  return attributes.get("path");
}

function readPaxAttributes(value: Buffer): ReadonlyMap<string, string> {
  const attributes = new Map<string, string>();
  let offset = 0;

  while (offset < value.length) {
    const space = value.indexOf(32, offset);
    if (space === -1) throw new Error("Repository archive contains invalid metadata");
    const length = Number.parseInt(value.toString("ascii", offset, space), 10);
    const recordEnd = offset + length;
    if (
      !Number.isSafeInteger(length) ||
      length <= 0 ||
      recordEnd > value.length ||
      value[recordEnd - 1] !== 10
    ) {
      throw new Error("Repository archive contains invalid metadata");
    }
    const separator = value.indexOf(61, space + 1);
    if (separator === -1 || separator >= recordEnd) {
      throw new Error("Repository archive contains invalid metadata");
    }
    const key = value.toString("utf8", space + 1, separator);
    attributes.set(key, value.toString("utf8", separator + 1, recordEnd - 1));
    offset = recordEnd;
  }

  return attributes;
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
