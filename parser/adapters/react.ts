import type { ParserAdapter } from "../types.ts";

export const reactAdapter: ParserAdapter = {
  name: "react",
  framework: "React",
  detect: (context) =>
    context.packageNames.has("react") ? "React" : null,
  roleFor: (file) => {
    const name = file.path.split("/").at(-1) ?? file.path;
    if (/\.(?:test|spec)\.[cm]?[jt]sx?$/u.test(name)) return "test";
    if (/^(?:index|main)\.[cm]?[jt]sx?$/u.test(name)) return "entry";
    if (/^use[A-Z].*\.[cm]?[jt]sx?$/u.test(name)) return "hook";
    if (/\.(?:jsx|tsx)$/u.test(name)) return "component";
    if (name.includes(".config.")) return "config";
    return null;
  },
  extractRoutes: () => [],
};
