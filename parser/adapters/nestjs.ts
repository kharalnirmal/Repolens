import { Node, Project, SyntaxKind } from "ts-morph";

import type {
  AdapterFile,
  ExtractedRoute,
  ParserAdapter,
} from "../types.ts";

const methodDecorators = new Map([
  ["Delete", "DELETE"],
  ["Get", "GET"],
  ["Head", "HEAD"],
  ["Options", "OPTIONS"],
  ["Patch", "PATCH"],
  ["Post", "POST"],
  ["Put", "PUT"],
]);

const suffixRoles = [
  [".controller", "controller"],
  [".service", "service"],
  [".module", "module"],
  [".entity", "entity"],
  [".guard", "guard"],
  [".pipe", "pipe"],
  [".interceptor", "interceptor"],
  [".middleware", "middleware"],
  [".dto", "dto"],
] as const;

export const nestjsAdapter: ParserAdapter = {
  name: "nestjs",
  framework: "NestJS",
  detect: (context) =>
    context.packageNames.has("@nestjs/core") ? "NestJS" : null,
  roleFor: (file) => {
    const stem = fileNameWithoutExtension(file.path);
    if (stem === "main") return "bootstrap";
    return suffixRoles.find(([suffix]) => stem.endsWith(suffix))?.[1] ?? null;
  },
  extractRoutes: (context) => {
    const globalPrefix = readGlobalPrefix(context.files);
    if (globalPrefix === null || hasUnsupportedRouteConfiguration(context.files)) {
      return [];
    }
    return context.files
      .filter((file) => fileNameWithoutExtension(file.path).endsWith(".controller"))
      .flatMap((file) => extractControllerRoutes(file, globalPrefix));
  },
};

function extractControllerRoutes(
  file: AdapterFile,
  globalPrefix: string,
): ExtractedRoute[] {
  const project = new Project({ useInMemoryFileSystem: true });
  const sourceFile = project.createSourceFile(file.path, file.content);
  const routes: ExtractedRoute[] = [];
  const decoratorNames = importedDecoratorNames(sourceFile);

  for (const classDeclaration of sourceFile.getClasses()) {
    const controller = classDeclaration
      .getDecorators()
      .find((decorator) => decoratorNames.get(decorator.getName()) === "Controller");
    if (!controller) continue;
    const controllerPath = readDecoratorPath(controller.getArguments());
    if (controllerPath === null) continue;

    for (const methodDeclaration of classDeclaration.getMethods()) {
      for (const decorator of methodDeclaration.getDecorators()) {
        const importedName = decoratorNames.get(decorator.getName());
        const method = importedName ? methodDecorators.get(importedName) : undefined;
        if (!method) continue;
        const methodPath = readDecoratorPath(decorator.getArguments());
        if (methodPath === null) continue;
        routes.push({
          filePath: file.path,
          method,
          path: joinRoutePath(globalPrefix, controllerPath, methodPath),
        });
      }
    }
  }

  return routes.toSorted(
    (left, right) =>
      left.path.localeCompare(right.path) || left.method.localeCompare(right.method),
  );
}

function importedDecoratorNames(
  sourceFile: import("ts-morph").SourceFile,
): ReadonlyMap<string, string> {
  const names = new Map<string, string>();
  for (const declaration of sourceFile.getImportDeclarations()) {
    if (declaration.getModuleSpecifierValue() !== "@nestjs/common") continue;
    for (const namedImport of declaration.getNamedImports()) {
      const importedName = namedImport.getName();
      if (importedName !== "Controller" && !methodDecorators.has(importedName)) {
        continue;
      }
      names.set(namedImport.getAliasNode()?.getText() ?? importedName, importedName);
    }
  }
  return names;
}

function readGlobalPrefix(files: readonly AdapterFile[]): string | null {
  const prefixes: string[] = [];
  for (const file of files) {
    const project = new Project({ useInMemoryFileSystem: true });
    const sourceFile = project.createSourceFile(file.path, file.content);
    for (const call of sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)) {
      const expression = call.getExpression();
      if (!Node.isPropertyAccessExpression(expression)) continue;
      if (expression.getName() !== "setGlobalPrefix") continue;
      const arguments_ = call.getArguments();
      if (arguments_.length !== 1) return null;
      const [argument] = arguments_;
      if (!Node.isStringLiteral(argument) && !Node.isNoSubstitutionTemplateLiteral(argument)) {
        return null;
      }
      prefixes.push(argument.getLiteralValue());
    }
  }
  return prefixes.length <= 1 ? (prefixes[0] ?? "") : null;
}

function hasUnsupportedRouteConfiguration(files: readonly AdapterFile[]): boolean {
  return files.some(
    (file) =>
      /\benableVersioning\s*\(/u.test(file.content) ||
      /@Version\s*\(/u.test(file.content) ||
      /\bRouterModule\s*\.\s*register\s*\(/u.test(file.content),
  );
}

function readDecoratorPath(arguments_: ReturnType<import("ts-morph").Decorator["getArguments"]>): string | null {
  if (arguments_.length === 0) return "";
  if (arguments_.length !== 1) return null;
  const [argument] = arguments_;
  if (Node.isStringLiteral(argument) || Node.isNoSubstitutionTemplateLiteral(argument)) {
    return argument.getLiteralValue();
  }
  return null;
}

function joinRoutePath(...parts: readonly string[]): string {
  const segments = parts
    .flatMap((part) => part.split("/"))
    .filter(Boolean);
  return `/${segments.join("/")}`;
}

function fileNameWithoutExtension(filePath: string): string {
  const name = filePath.split("/").at(-1) ?? filePath;
  const dot = name.lastIndexOf(".");
  return dot === -1 ? name : name.slice(0, dot);
}
