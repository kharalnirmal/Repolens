export const importKinds = ["import", "re-export", "dynamic-import"] as const;

export type ImportKind = (typeof importKinds)[number];
export type ModuleKind = "esm" | "commonjs" | "script";
export type ImportResolutionStatus =
  | "resolved"
  | "external"
  | "excluded"
  | "unresolved";

export interface ParsedFile {
  path: string;
  folder: string;
  content: string;
  contentHash: string;
  lineCount: number;
  moduleKind: ModuleKind;
  exports: string[];
  fanIn: number;
  fanOut: number;
}

export interface DependencyEdge {
  sourcePath: string;
  targetPath: string;
  kind: ImportKind;
  specifier: string;
}

export interface ImportResolution {
  sourcePath: string;
  kind: ImportKind;
  specifier: string;
  status: ImportResolutionStatus;
  targetPath?: string;
  reason?: string;
}

export interface SkippedFile {
  path: string;
  reason: string;
}

export interface CoverageReport {
  filesFound: number;
  filesParsed: number;
  filesSkipped: number;
  importsFound: number;
  importsResolved: number;
  importsExternal: number;
  importsExcluded: number;
  importsUnresolved: number;
  reExportsFound: number;
  reExportsResolved: number;
  skippedFiles: SkippedFile[];
  excludedDirectories: string[];
  imports: ImportResolution[];
}

export interface RepositoryParseResult {
  schemaVersion: 1;
  repository: {
    name: string;
    root: string;
  };
  adapter: {
    name: string;
    framework: string | null;
  };
  files: ParsedFile[];
  edges: DependencyEdge[];
  fileRoles: FileRole[];
  routes: ExtractedRoute[];
  coverage: CoverageReport;
}

export interface AdapterFile {
  path: string;
  content: string;
  moduleKind: ModuleKind;
  exports: readonly string[];
}

export interface AdapterContext {
  root: string;
  files: readonly AdapterFile[];
  packageNames: ReadonlySet<string>;
}

export interface FileRole {
  filePath: string;
  role: string;
  source: "convention" | "fallback";
}

export interface ExtractedRoute {
  filePath: string;
  method: string;
  path: string;
}

export interface ParserAdapter {
  readonly name: string;
  readonly framework: string | null;
  detect(context: AdapterContext): string | null;
  roleFor(file: AdapterFile): string | null;
  extractRoutes(context: AdapterContext): ExtractedRoute[];
}
