import type { ParserAdapter } from "./types.ts";

const conventionalEntryStems = new Set([
  "index",
  "layout",
  "layouts",
  "main",
  "middleware",
  "page",
  "route",
  "routes",
]);

const conventionalEntryDirectories = new Set(["layouts", "pages", "routes"]);

export const fallbackAdapter: ParserAdapter = {
  name: "fallback",
  detect: () => null,
  /** Identify conventional entry or config paths that imports alone may not reach. */
  isConventionEntry: (filePath) => {
    const segments = filePath.split("/");
    const name = segments.at(-1) ?? filePath;
    const extensionIndex = name.lastIndexOf(".");
    const stem = extensionIndex === -1 ? name : name.slice(0, extensionIndex);

    return (
      conventionalEntryStems.has(stem) ||
      segments.some((segment) => conventionalEntryDirectories.has(segment)) ||
      stem === "config" ||
      name.includes(".config.")
    );
  },
};
