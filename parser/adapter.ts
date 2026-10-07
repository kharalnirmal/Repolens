import { nestjsAdapter } from "./adapters/nestjs.ts";
import { nextjsAdapter } from "./adapters/nextjs.ts";
import { reactAdapter } from "./adapters/react.ts";
import type { AdapterContext, AdapterFile, ParserAdapter } from "./types.ts";

export const fallbackAdapter: ParserAdapter = {
  name: "fallback",
  framework: null,
  detect: () => null,
  roleFor: (file) => genericRole(file),
  extractRoutes: () => [],
};

export const adapters: readonly ParserAdapter[] = [
  nextjsAdapter,
  nestjsAdapter,
  reactAdapter,
  fallbackAdapter,
];

export function selectAdapter(context: AdapterContext): ParserAdapter {
  return adapters.find((adapter) => adapter.detect(context) !== null) ?? fallbackAdapter;
}

export function genericRole(file: AdapterFile): string {
  const name = file.path.split("/").at(-1) ?? file.path;
  if (/\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(name)) return "test";
  if (/^(?:index|main)\.[cm]?[jt]sx?$/u.test(name)) return "entry";
  if (name.includes(".config.") || fileStem(name) === "config") return "config";
  if (name.endsWith(".d.ts")) return "type";
  return "source";
}

function fileStem(name: string): string {
  const dot = name.indexOf(".");
  return dot === -1 ? name : name.slice(0, dot);
}
