import { Node, Project } from "ts-morph";

import type {
  AdapterFile,
  ExtractedRoute,
  ParserAdapter,
} from "../types.ts";

const routeMethods = new Set([
  "DELETE",
  "GET",
  "HEAD",
  "OPTIONS",
  "PATCH",
  "POST",
  "PUT",
]);

export const nextjsAdapter: ParserAdapter = {
  name: "nextjs",
  framework: "Next.js",
  detect: (context) =>
    context.packageNames.has("next") ? "Next.js" : null,
  roleFor: (file) => {
    const name = file.path.split("/").at(-1) ?? file.path;
    if (isAppFile(file.path, "page") || isPagesPage(file.path)) return "page";
    if (isAppFile(file.path, "route") || isPagesApi(file.path)) return "api";
    if (hasFileDirective(file.content, "use server")) return "server-action";
    if (isAppFile(file.path, "layout")) return "layout";
    if (fileStem(file.path) === "middleware") return "middleware";
    if (/\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(name)) return "test";
    if (isConfig(file.path)) return "config";
    if (/\.(?:jsx|tsx)$/u.test(file.path)) return "component";
    return null;
  },
  extractRoutes: (context) =>
    hasConfiguredRoutePrefix(context.files)
      ? []
      : context.files.flatMap((file) => extractFileRoutes(file)),
};

function extractFileRoutes(file: AdapterFile): ExtractedRoute[] {
  if (isAppFile(file.path, "page")) {
    const routePath = appRoutePath(file.path);
    return routePath === null
      ? []
      : [{ filePath: file.path, method: "GET", path: routePath }];
  }

  if (isAppFile(file.path, "route")) {
    const routePath = appRoutePath(file.path);
    if (routePath === null) return [];
    return file.exports
      .filter((name) => routeMethods.has(name))
      .toSorted()
      .map((method) => ({ filePath: file.path, method, path: routePath }));
  }

  if (isPagesPage(file.path)) {
    const routePath = pagesRoutePath(file.path);
    return routePath === null
      ? []
      : [{ filePath: file.path, method: "GET", path: routePath }];
  }

  return [];
}

function appRoutePath(filePath: string): string | null {
  const segments = filePath.split("/");
  const appIndex = appDirectoryIndex(segments);
  if (appIndex === -1) return null;

  const routeSegments: string[] = [];
  for (const segment of segments.slice(appIndex + 1, -1)) {
    if (segment.startsWith("(") && segment.endsWith(")")) continue;
    if (segment.startsWith("@")) continue;
    if (segment.startsWith("(") || segment.startsWith("_")) return null;
    routeSegments.push(segment);
  }
  return `/${routeSegments.join("/")}`;
}

function pagesRoutePath(filePath: string): string | null {
  const segments = filePath.split("/");
  const pagesIndex = pagesDirectoryIndex(segments);
  if (pagesIndex === -1 || segments[pagesIndex + 1] === "api") return null;
  const stem = fileStem(filePath);
  if (stem.startsWith("_")) return null;

  const routeSegments = [...segments.slice(pagesIndex + 1, -1)];
  if (stem !== "index") routeSegments.push(stem);
  return `/${routeSegments.join("/")}`;
}

function isAppFile(filePath: string, stem: string): boolean {
  const segments = filePath.split("/");
  return appDirectoryIndex(segments) !== -1 && fileStem(filePath) === stem;
}

function isPagesPage(filePath: string): boolean {
  const segments = filePath.split("/");
  const index = pagesDirectoryIndex(segments);
  return index !== -1 && segments[index + 1] !== "api" && !fileStem(filePath).startsWith("_");
}

function isPagesApi(filePath: string): boolean {
  const segments = filePath.split("/");
  const index = pagesDirectoryIndex(segments);
  return index !== -1 && segments[index + 1] === "api";
}

function appDirectoryIndex(segments: readonly string[]): number {
  if (segments[0] === "app") return 0;
  return segments[0] === "src" && segments[1] === "app" ? 1 : -1;
}

function pagesDirectoryIndex(segments: readonly string[]): number {
  if (segments[0] === "pages") return 0;
  return segments[0] === "src" && segments[1] === "pages" ? 1 : -1;
}

function hasFileDirective(content: string, directive: string): boolean {
  const project = new Project({ useInMemoryFileSystem: true });
  const sourceFile = project.createSourceFile("file.ts", content);
  for (const statement of sourceFile.getStatements()) {
    if (!Node.isExpressionStatement(statement)) return false;
    const expression = statement.getExpression();
    if (!Node.isStringLiteral(expression)) return false;
    if (expression.getLiteralValue() === directive) return true;
  }
  return false;
}

function isConfig(filePath: string): boolean {
  const name = filePath.split("/").at(-1) ?? filePath;
  return fileStem(filePath) === "config" || name.includes(".config.");
}

function hasConfiguredRoutePrefix(files: readonly AdapterFile[]): boolean {
  return files.some((file) => {
    const name = file.path.split("/").at(-1) ?? file.path;
    return (
      /^next\.config\.[cm]?[jt]s$/u.test(name) &&
      /\b(?:basePath|i18n)\s*:/u.test(file.content)
    );
  });
}

function fileStem(filePath: string): string {
  const name = filePath.split("/").at(-1) ?? filePath;
  const dot = name.lastIndexOf(".");
  return dot === -1 ? name : name.slice(0, dot);
}
