export interface RoleCategory {
  role: string;
  label: string;
}

const genericCategories: readonly RoleCategory[] = [
  { role: "entry", label: "Entry points" },
  { role: "source", label: "Source files" },
  { role: "test", label: "Tests" },
  { role: "type", label: "Type declarations" },
  { role: "config", label: "Configuration" },
];

const taxonomies: Record<string, readonly RoleCategory[]> = {
  "Next.js": [
    { role: "page", label: "Page routes" },
    { role: "api", label: "API endpoints" },
    { role: "server-action", label: "Server actions" },
    { role: "component", label: "Components" },
    { role: "layout", label: "Layouts" },
    { role: "middleware", label: "Middleware" },
    { role: "config", label: "Configuration" },
    { role: "source", label: "Other source" },
    { role: "test", label: "Tests" },
    { role: "type", label: "Type declarations" },
  ],
  NestJS: [
    { role: "controller", label: "Controllers" },
    { role: "service", label: "Services" },
    { role: "module", label: "Modules" },
    { role: "entity", label: "Entities" },
    { role: "guard", label: "Guards" },
    { role: "pipe", label: "Pipes" },
    { role: "interceptor", label: "Interceptors" },
    { role: "middleware", label: "Middleware" },
    { role: "dto", label: "DTOs" },
    { role: "bootstrap", label: "Bootstrap" },
    { role: "source", label: "Other source" },
    { role: "test", label: "Tests" },
    { role: "config", label: "Configuration" },
    { role: "type", label: "Type declarations" },
  ],
  Express: [
    { role: "route", label: "Routes" },
    { role: "controller", label: "Controllers" },
    { role: "service", label: "Services" },
    { role: "model", label: "Models" },
    { role: "middleware", label: "Middleware" },
    { role: "entry", label: "Entry points" },
    { role: "source", label: "Other source" },
    { role: "test", label: "Tests" },
    { role: "config", label: "Configuration" },
    { role: "type", label: "Type declarations" },
  ],
  React: [
    { role: "entry", label: "Entry points" },
    { role: "component", label: "Components" },
    { role: "hook", label: "Hooks" },
    { role: "source", label: "Other source" },
    { role: "test", label: "Tests" },
    { role: "config", label: "Configuration" },
    { role: "type", label: "Type declarations" },
  ],
};

export function taxonomyFor(framework: string | null): readonly RoleCategory[] {
  return framework === null ? genericCategories : (taxonomies[framework] ?? genericCategories);
}
