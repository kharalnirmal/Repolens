import { createRequire } from "node:module";

interface NextEnvironmentModule {
  loadEnvConfig(directory: string, development?: boolean): void;
}

export function loadScriptEnvironment(): void {
  const requireFromNext = createRequire(import.meta.resolve("next/package.json"));
  const nextEnvironment = requireFromNext("@next/env") as NextEnvironmentModule;
  nextEnvironment.loadEnvConfig(
    process.cwd(),
    process.env.NODE_ENV !== "production",
  );
}

export function requireEnvironment(name: string): string {
  const value = process.env[name];
  if (!value?.trim()) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
