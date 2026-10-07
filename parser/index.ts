import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import {
  Node,
  Project,
  ScriptTarget,
  SyntaxKind,
  ts,
  type SourceFile,
} from "ts-morph";

import { genericRole, selectAdapter } from "./adapter.ts";
import { calculateFanCounts } from "./graph.ts";
import type {
  DependencyEdge,
  ExtractedRoute,
  FileRole,
  ImportKind,
  ImportResolution,
  ModuleKind,
  ParsedFile,
  ParserAdapter,
  RepositoryParseResult,
  SkippedFile,
} from "./types.ts";

export type {
  AdapterContext,
  CoverageReport,
  DependencyEdge,
  ExtractedRoute,
  FileRole,
  ImportKind,
  ImportResolution,
  ImportResolutionStatus,
  ModuleKind,
  ParsedFile,
  ParserAdapter,
  RepositoryParseResult,
  SkippedFile,
} from "./types.ts";

const sourceExtensions = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mts",
  ".cts",
  ".mjs",
  ".cjs",
]);

const excludedDirectoryNames = new Set([
  ".git",
  ".next",
  ".turbo",
  ".vercel",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "out",
]);

interface WalkedSource {
  absolutePath: string;
  relativePath: string;
  content: string;
}

interface SeenImport {
  sourcePath: string;
  sourceAbsolutePath: string;
  kind: ImportKind;
  specifier: string;
}

interface WalkResult {
  sources: WalkedSource[];
  skippedFiles: SkippedFile[];
  skippedByAbsolutePath: Map<string, SkippedFile>;
  excludedDirectories: string[];
}

export interface ParseRepositoryOptions {
  adapter?: ParserAdapter;
  onFilesSelected?: (fileCount: number) => void | Promise<void>;
}

export async function parseRepository(
  directoryPath: string,
  options: ParseRepositoryOptions = {},
): Promise<RepositoryParseResult> {
  const root = path.resolve(directoryPath);
  const rootStat = await fs.stat(root).catch(() => null);

  if (!rootStat?.isDirectory()) {
    throw new Error(`Repository path is not a directory: ${root}`);
  }

  const walked = await walkRepository(root);
  await options.onFilesSelected?.(walked.sources.length);
  const project = createProject(root);
  const sourceFilesByPath = new Map<string, SourceFile>();

  for (const source of walked.sources) {
    sourceFilesByPath.set(
      canonicalPath(source.absolutePath),
      project.createSourceFile(source.absolutePath, source.content, {
        overwrite: true,
      }),
    );
  }

  const files = walked.sources.map((source) => {
    const sourceFile = sourceFilesByPath.get(canonicalPath(source.absolutePath));
    if (!sourceFile) {
      throw new Error(`Source file was not added to the parser: ${source.relativePath}`);
    }

    return createParsedFile(source, sourceFile);
  });

  const imports = walked.sources.flatMap((source) => {
    const sourceFile = sourceFilesByPath.get(canonicalPath(source.absolutePath));
    if (!sourceFile) {
      throw new Error(`Source file was not added to the parser: ${source.relativePath}`);
    }

    return collectImports(source, sourceFile);
  });

  const resolutions = imports.map((seenImport) =>
    resolveImport(
      seenImport,
      root,
      project.getCompilerOptions(),
      sourceFilesByPath,
      walked.skippedByAbsolutePath,
    ),
  );
  const edges = deduplicateEdges(resolutions);
  const fanCounts = calculateFanCounts(files, edges);

  for (const file of files) {
    const counts = fanCounts.get(file.path);
    if (!counts) {
      throw new Error(`Fan counts are missing for ${file.path}`);
    }
    file.fanIn = counts.fanIn;
    file.fanOut = counts.fanOut;
  }

  const context = {
    root,
    files,
    packageNames: await readPackageNames(root),
  };
  const adapter = options.adapter ?? selectAdapter(context);
  const framework = adapter.detect(context);
  const fileRoles: FileRole[] = files.map((file) => {
    const role = adapter.roleFor(file);
    return {
      filePath: file.path,
      role: role ?? genericRole(file),
      source:
        adapter.framework === null || role === null ? "fallback" : "convention",
    };
  });
  const routes = deduplicateRoutes(adapter.extractRoutes(context));
  const reExports = resolutions.filter(
    (resolution) => resolution.kind === "re-export",
  );

  return {
    schemaVersion: 1,
    repository: {
      name: path.basename(root),
      root,
    },
    adapter: {
      name: adapter.name,
      framework,
    },
    files,
    edges,
    fileRoles,
    routes,
    coverage: {
      filesFound: files.length + walked.skippedFiles.length,
      filesParsed: files.length,
      filesSkipped: walked.skippedFiles.length,
      importsFound: resolutions.length,
      importsResolved: countStatus(resolutions, "resolved"),
      importsExternal: countStatus(resolutions, "external"),
      importsExcluded: countStatus(resolutions, "excluded"),
      importsUnresolved: countStatus(resolutions, "unresolved"),
      reExportsFound: reExports.length,
      reExportsResolved: countStatus(reExports, "resolved"),
      skippedFiles: walked.skippedFiles,
      excludedDirectories: walked.excludedDirectories,
      imports: resolutions,
    },
  };
}

async function readPackageNames(root: string): Promise<ReadonlySet<string>> {
  const packagePath = path.join(root, "package.json");
  const content = await fs.readFile(packagePath, "utf8").catch(() => null);
  if (content === null) return new Set();

  try {
    const manifest: unknown = JSON.parse(content);
    if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
      return new Set();
    }
    const record = manifest as Record<string, unknown>;
    const names = new Set<string>();
    for (const field of ["dependencies", "devDependencies", "peerDependencies"]) {
      const dependencies = record[field];
      if (!dependencies || typeof dependencies !== "object" || Array.isArray(dependencies)) {
        continue;
      }
      for (const name of Object.keys(dependencies)) names.add(name);
    }
    return names;
  } catch {
    return new Set();
  }
}

function deduplicateRoutes(routes: readonly ExtractedRoute[]): ExtractedRoute[] {
  const routesByEndpoint = new Map<string, Map<string, ExtractedRoute>>();
  for (const route of routes) {
    const endpoint = [route.method, route.path].join("\0");
    const routesByFile = routesByEndpoint.get(endpoint) ?? new Map();
    routesByFile.set(route.filePath, route);
    routesByEndpoint.set(endpoint, routesByFile);
  }

  return [...routesByEndpoint.values()]
    .filter((routesByFile) => routesByFile.size === 1)
    .map((routesByFile) => [...routesByFile.values()][0])
    .toSorted(
    (left, right) =>
      left.path.localeCompare(right.path) ||
      left.method.localeCompare(right.method) ||
      left.filePath.localeCompare(right.filePath),
    );
}

function createProject(root: string): Project {
  const configPath = ["tsconfig.json", "jsconfig.json"]
    .map((fileName) => `${root}${path.sep}${fileName}`)
    .find((candidate) => ts.sys.fileExists(candidate));

  if (configPath) {
    return new Project({
      tsConfigFilePath: configPath,
      skipAddingFilesFromTsConfig: true,
      compilerOptions: { allowJs: true, noEmit: true },
    });
  }

  return new Project({
    compilerOptions: {
      allowJs: true,
      checkJs: false,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      noEmit: true,
      target: ScriptTarget.ESNext,
    },
  });
}

async function walkRepository(root: string): Promise<WalkResult> {
  const sources: WalkedSource[] = [];
  const skippedFiles: SkippedFile[] = [];
  const skippedByAbsolutePath = new Map<string, SkippedFile>();
  const excludedDirectories: string[] = [];

  async function walk(directory: string): Promise<void> {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      const relativePath = toRepositoryPath(root, absolutePath);

      if (entry.isDirectory()) {
        if (excludedDirectoryNames.has(entry.name)) {
          excludedDirectories.push(relativePath);
        } else {
          await walk(absolutePath);
        }
        continue;
      }

      if (!entry.isFile()) {
        addSkippedFile(
          absolutePath,
          relativePath,
          "symbolic links and special files are deliberately excluded",
          skippedFiles,
          skippedByAbsolutePath,
        );
        continue;
      }

      const extension = path.extname(entry.name).toLowerCase();
      if (!sourceExtensions.has(extension)) {
        addSkippedFile(
          absolutePath,
          relativePath,
          extension
            ? `unsupported extension ${extension}`
            : "file has no supported source extension",
          skippedFiles,
          skippedByAbsolutePath,
        );
        continue;
      }

      try {
        const content = await fs.readFile(absolutePath, "utf8");
        sources.push({ absolutePath, relativePath, content });
      } catch (error) {
        addSkippedFile(
          absolutePath,
          relativePath,
          `could not read file: ${errorMessage(error)}`,
          skippedFiles,
          skippedByAbsolutePath,
        );
      }
    }
  }

  await walk(root);
  return { sources, skippedFiles, skippedByAbsolutePath, excludedDirectories };
}

function addSkippedFile(
  absolutePath: string,
  relativePath: string,
  reason: string,
  skippedFiles: SkippedFile[],
  skippedByAbsolutePath: Map<string, SkippedFile>,
): void {
  const skipped = { path: relativePath, reason };
  skippedFiles.push(skipped);
  skippedByAbsolutePath.set(canonicalPath(absolutePath), skipped);
}

function createParsedFile(source: WalkedSource, sourceFile: SourceFile): ParsedFile {
  const extension = path.extname(source.absolutePath).toLowerCase();
  const folder = path.posix.dirname(source.relativePath);
  const exports = new Set(
    sourceFile.getExportSymbols().map((symbol) => symbol.getName()),
  );
  for (const name of collectCommonJsExports(sourceFile)) exports.add(name);

  return {
    path: source.relativePath,
    folder,
    content: source.content,
    contentHash: createHash("sha256").update(source.content).digest("hex"),
    lineCount:
      source.content.length === 0
        ? 0
        : source.content.split(/\r\n|\r|\n/u).length,
    moduleKind: detectModuleKind(sourceFile, extension),
    exports: [...exports].sort(),
    fanIn: 0,
    fanOut: 0,
  };
}

function detectModuleKind(
  sourceFile: SourceFile,
  extension: string,
): ModuleKind {
  if (extension === ".cjs" || extension === ".cts") return "commonjs";
  if (extension === ".mjs" || extension === ".mts") return "esm";

  const hasCommonJsModuleSyntax =
    sourceFile
      .getDescendantsOfKind(SyntaxKind.ImportEqualsDeclaration)
      .some((declaration) =>
        Node.isExternalModuleReference(declaration.getModuleReference()),
      ) ||
    sourceFile
      .getExportAssignments()
      .some((assignment) => assignment.isExportEquals()) ||
    sourceFile
      .getDescendantsOfKind(SyntaxKind.CallExpression)
      .some((call) => isRequireCall(call)) ||
    sourceFile
      .getDescendantsOfKind(SyntaxKind.BinaryExpression)
      .some((expression) =>
        expression.getOperatorToken().getKind() === SyntaxKind.EqualsToken &&
        isCommonJsExportTarget(expression.getLeft()),
      );

  if (hasCommonJsModuleSyntax) return "commonjs";
  if (
    sourceFile.getImportDeclarations().length > 0 ||
    sourceFile.getExportDeclarations().length > 0 ||
    sourceFile.getExportAssignments().length > 0 ||
    sourceFile.getExportSymbols().length > 0
  ) {
    return "esm";
  }
  return "script";
}

function collectImports(
  source: WalkedSource,
  sourceFile: SourceFile,
): SeenImport[] {
  const imports: SeenImport[] = [];
  const addImport = (kind: ImportKind, specifier: string): void => {
    imports.push({
      sourcePath: source.relativePath,
      sourceAbsolutePath: source.absolutePath,
      kind,
      specifier,
    });
  };

  for (const declaration of sourceFile.getImportDeclarations()) {
    addImport("import", declaration.getModuleSpecifierValue());
  }

  for (const declaration of sourceFile.getExportDeclarations()) {
    const specifier = declaration.getModuleSpecifierValue();
    if (specifier !== undefined) addImport("re-export", specifier);
  }

  sourceFile.forEachDescendant((node) => {
    if (!Node.isCallExpression(node)) return;
    const [argument] = node.getArguments();
    if (!argument || !isLiteralString(argument)) return;

    if (node.getExpression().getKind() === SyntaxKind.ImportKeyword) {
      addImport("dynamic-import", argument.getLiteralValue());
    } else if (isRequireCall(node)) {
      addImport("require", argument.getLiteralValue());
    }
  });

  return imports;
}

function collectCommonJsExports(sourceFile: SourceFile): string[] {
  const names = new Set<string>();

  for (const expression of sourceFile.getDescendantsOfKind(
    SyntaxKind.BinaryExpression,
  )) {
    if (expression.getOperatorToken().getKind() !== SyntaxKind.EqualsToken) {
      continue;
    }

    const left = expression.getLeft();
    const memberName = commonJsExportMemberName(left);
    if (memberName !== null) {
      names.add(memberName);
      continue;
    }

    if (!isModuleExports(left)) continue;
    const right = expression.getRight();
    if (!Node.isObjectLiteralExpression(right)) continue;

    for (const property of right.getProperties()) {
      if (
        Node.isPropertyAssignment(property) ||
        Node.isShorthandPropertyAssignment(property) ||
        Node.isMethodDeclaration(property) ||
        Node.isGetAccessorDeclaration(property) ||
        Node.isSetAccessorDeclaration(property)
      ) {
        names.add(property.getName());
      }
    }
  }

  for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const expression = call.getExpression();
    if (!Node.isPropertyAccessExpression(expression)) continue;
    if (expression.getName() !== "defineProperty") continue;
    if (expression.getExpression().getText() !== "Object") continue;

    const [target, property] = call.getArguments();
    if (
      target &&
      property &&
      isCommonJsExportsObject(target) &&
      isLiteralString(property)
    ) {
      names.add(property.getLiteralValue());
    }
  }

  return [...names];
}

function isRequireCall(node: import("ts-morph").CallExpression): boolean {
  const expression = node.getExpression();
  return Node.isIdentifier(expression) && expression.getText() === "require";
}

function isLiteralString(
  node: import("ts-morph").Node,
): node is import("ts-morph").StringLiteral | import("ts-morph").NoSubstitutionTemplateLiteral {
  return Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node);
}

function isCommonJsExportTarget(node: import("ts-morph").Node): boolean {
  return isModuleExports(node) || commonJsExportMemberName(node) !== null;
}

function commonJsExportMemberName(node: import("ts-morph").Node): string | null {
  if (Node.isPropertyAccessExpression(node)) {
    return isCommonJsExportsObject(node.getExpression()) ? node.getName() : null;
  }
  if (Node.isElementAccessExpression(node)) {
    const argument = node.getArgumentExpression();
    return isCommonJsExportsObject(node.getExpression()) && argument && isLiteralString(argument)
      ? argument.getLiteralValue()
      : null;
  }
  return null;
}

function isCommonJsExportsObject(node: import("ts-morph").Node): boolean {
  return (
    (Node.isIdentifier(node) && node.getText() === "exports") ||
    isModuleExports(node)
  );
}

function isModuleExports(node: import("ts-morph").Node): boolean {
  if (Node.isPropertyAccessExpression(node)) {
    return node.getExpression().getText() === "module" && node.getName() === "exports";
  }
  if (Node.isElementAccessExpression(node)) {
    const argument = node.getArgumentExpression();
    return (
      node.getExpression().getText() === "module" &&
      argument !== undefined &&
      isLiteralString(argument) &&
      argument.getLiteralValue() === "exports"
    );
  }
  return false;
}

function resolveImport(
  seenImport: SeenImport,
  root: string,
  compilerOptions: ts.CompilerOptions,
  sourceFilesByPath: ReadonlyMap<string, SourceFile>,
  skippedByAbsolutePath: ReadonlyMap<string, SkippedFile>,
): ImportResolution {
  const resolved = ts.resolveModuleName(
    seenImport.specifier,
    seenImport.sourceAbsolutePath,
    compilerOptions,
    ts.sys,
  ).resolvedModule;

  if (resolved) {
    const resolvedPath = path.resolve(resolved.resolvedFileName);
    if (
      resolved.isExternalLibraryImport ||
      resolvedPath.split(path.sep).includes("node_modules")
    ) {
      return resolution(
        seenImport,
        "external",
        undefined,
        "package or runtime module outside repository",
      );
    }

    if (!isInside(root, resolvedPath)) {
      return resolution(seenImport, "external", undefined, "resolved outside repository");
    }

    const target = sourceFilesByPath.get(canonicalPath(resolvedPath));
    if (target) {
      return resolution(
        seenImport,
        "resolved",
        toRepositoryPath(root, target.getFilePath()),
      );
    }

    const skipped = skippedByAbsolutePath.get(canonicalPath(resolvedPath));
    return resolution(
      seenImport,
      "excluded",
      toRepositoryPath(root, resolvedPath),
      skipped?.reason ?? "resolved file is deliberately excluded from parser nodes",
    );
  }

  const excluded = findExcludedTarget(
    seenImport,
    root,
    skippedByAbsolutePath,
  );
  if (excluded) {
    return resolution(
      seenImport,
      "excluded",
      excluded.path,
      excluded.reason,
    );
  }

  if (matchesPathAlias(seenImport.specifier, compilerOptions.paths)) {
    return resolution(
      seenImport,
      "unresolved",
      undefined,
      "module specifier matched a tsconfig paths alias but resolved to no file",
    );
  }

  if (!isPathSpecifier(seenImport.specifier)) {
    return resolution(
      seenImport,
      "external",
      undefined,
      "package or runtime module outside repository",
    );
  }

  return resolution(
    seenImport,
    "unresolved",
    undefined,
    "no file matched the module specifier",
  );
}

function findExcludedTarget(
  seenImport: SeenImport,
  root: string,
  skippedByAbsolutePath: ReadonlyMap<string, SkippedFile>,
): SkippedFile | undefined {
  if (!isPathSpecifier(seenImport.specifier)) return undefined;

  const base = path.resolve(
    path.dirname(seenImport.sourceAbsolutePath),
    seenImport.specifier,
  );
  if (!isInside(root, base)) return undefined;

  const candidates = [
    base,
    ...[...sourceExtensions].map((extension) => `${base}${extension}`),
    ...[...sourceExtensions].map((extension) =>
      path.join(base, `index${extension}`),
    ),
  ];

  for (const candidate of candidates) {
    const skipped = skippedByAbsolutePath.get(canonicalPath(candidate));
    if (skipped) return skipped;
  }

  const relativeParts = path.relative(root, base).split(path.sep);
  const excludedPart = relativeParts.find((part) =>
    excludedDirectoryNames.has(part),
  );
  if (excludedPart) {
    return {
      path: toRepositoryPath(root, base),
      reason: `target is inside excluded directory ${excludedPart}`,
    };
  }

  return undefined;
}

function resolution(
  seenImport: SeenImport,
  status: ImportResolution["status"],
  targetPath?: string,
  reason?: string,
): ImportResolution {
  return {
    sourcePath: seenImport.sourcePath,
    kind: seenImport.kind,
    specifier: seenImport.specifier,
    status,
    ...(targetPath ? { targetPath } : {}),
    ...(reason ? { reason } : {}),
  };
}

function deduplicateEdges(
  resolutions: readonly ImportResolution[],
): DependencyEdge[] {
  const edges = new Map<string, DependencyEdge>();

  for (const item of resolutions) {
    if (item.status !== "resolved" || !item.targetPath) continue;
    const edge = {
      sourcePath: item.sourcePath,
      targetPath: item.targetPath,
      kind: item.kind,
      specifier: item.specifier,
    };
    const key = [edge.sourcePath, edge.targetPath, edge.kind, edge.specifier].join(
      "\0",
    );
    edges.set(key, edge);
  }

  return [...edges.values()];
}

function countStatus(
  resolutions: readonly ImportResolution[],
  status: ImportResolution["status"],
): number {
  return resolutions.filter((item) => item.status === status).length;
}

function isPathSpecifier(specifier: string): boolean {
  return (
    specifier.startsWith(".") ||
    specifier.startsWith("/") ||
    /^[A-Za-z]:[\\/]/u.test(specifier)
  );
}

function matchesPathAlias(
  specifier: string,
  paths: ts.MapLike<string[]> | undefined,
): boolean {
  if (!paths) return false;

  return Object.keys(paths).some((pattern) => {
    const wildcardIndex = pattern.indexOf("*");
    if (wildcardIndex === -1) return specifier === pattern;

    const prefix = pattern.slice(0, wildcardIndex);
    const suffix = pattern.slice(wildcardIndex + 1);
    return specifier.startsWith(prefix) && specifier.endsWith(suffix);
  });
}

function isInside(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function canonicalPath(filePath: string): string {
  const normalized = path.normalize(filePath);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function toRepositoryPath(root: string, filePath: string): string {
  return path.relative(root, filePath).split(path.sep).join("/") || ".";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
