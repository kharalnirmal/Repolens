import type { ParserAdapter } from "../types.ts";

const directoryRoles = new Map([
  ["route", "route"],
  ["routes", "route"],
  ["controller", "controller"],
  ["controllers", "controller"],
  ["service", "service"],
  ["services", "service"],
  ["model", "model"],
  ["models", "model"],
  ["middleware", "middleware"],
  ["middlewares", "middleware"],
  ["config", "config"],
  ["configs", "config"],
]);

export const expressAdapter: ParserAdapter = {
  name: "express",
  framework: "Express",
  detect: (context) =>
    context.packageNames.has("express") ? "Express" : null,
  roleFor: (file) => {
    for (const segment of file.path.split("/").slice(0, -1).toReversed()) {
      const role = directoryRoles.get(segment.toLowerCase());
      if (role) return role;
    }
    return null;
  },
  extractRoutes: () => [],
};
