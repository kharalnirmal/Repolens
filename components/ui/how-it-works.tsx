"use client";

import { LazyMotion, domAnimation, m, useReducedMotion } from "motion/react";

export interface Step {
  title: string;
  description: string;
}

export interface HowItWorksProps {
  features?: Step[];
  className?: string;
}

const defaultFeatures: Step[] = [
  {
    title: "Index the repository",
    description: "RepoLens reads each supported source file and records its imports, re-exports, dynamic imports, and CommonJS requires.",
  },
  {
    title: "Build the dependency graph",
    description: "Every import is resolved against files that actually exist. Successful resolutions become directional edges; unresolved imports stay visible.",
  },
  {
    title: "Explain from evidence",
    description: "Only after the graph is complete does AI explain the selected files and their impact. It describes parser facts instead of inventing structure.",
  },
];

const files = [
  { depth: 0, name: "repolens/", kind: "folder" },
  { depth: 1, name: "app/", kind: "folder" },
  { depth: 2, name: "page.tsx", kind: "file" },
  { depth: 2, name: "api/", kind: "folder" },
  { depth: 3, name: "route.ts", kind: "active" },
  { depth: 1, name: "lib/github.ts", kind: "file" },
  { depth: 1, name: "parser/resolve.ts", kind: "file" },
] as const;

function FolderIcon({ open = false }: { open?: boolean }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3.5 shrink-0" fill="none">
      <path d={open ? "M1.5 4.5h5l1.3 1.5h6.7l-1.4 6.5H2.5L1.5 4.5Z" : "M1.5 3.5h5L8 5h6.5v7.5h-13v-9Z"} className="fill-imports/15 stroke-imports" strokeWidth="1.15" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3.5 shrink-0" fill="none">
      <path d="M3 1.5h6l4 4v9H3v-13Z" className="fill-surface stroke-muted-foreground" />
      <path d="M9 1.5v4h4" className="stroke-muted-foreground" />
    </svg>
  );
}

function SourceTree({ reduceMotion }: { reduceMotion: boolean | null }) {
  return (
    <div className="relative min-h-[300px] overflow-hidden rounded-lg border border-border bg-background xl:min-h-[320px]">
      <div className="relative py-3">
        {!reduceMotion && (
          <m.div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 z-10 h-9 border-y border-imports/35 bg-imports/8"
            initial={{ y: 0 }}
            animate={{ y: [0, 216, 0] }}
            transition={{ duration: 6.4, repeat: Infinity, ease: "easeInOut", repeatDelay: 0.8 }}
          />
        )}
        {files.map((file, index) => (
          <m.div
            key={file.name}
            className={`relative flex h-9 items-center gap-2.5 pr-4 font-mono text-[11px] xl:text-xs ${file.kind === "active" ? "bg-imports/10 text-foreground" : "text-muted-foreground"}`}
            style={{ paddingLeft: 14 + file.depth * 15 }}
            initial={reduceMotion ? false : { opacity: 0, x: -6 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true, amount: 0.8 }}
            transition={{ duration: 0.25, delay: index * 0.06 }}
          >
            {file.kind === "folder" ? <FolderIcon open /> : <FileIcon />}
            <span>{file.name}</span>
            {file.kind === "active" && <span className="ml-auto size-1.5 bg-imports" />}
          </m.div>
        ))}
      </div>
    </div>
  );
}

function ResolvedImports({ reduceMotion }: { reduceMotion: boolean | null }) {
  const nodes = [
    { x: 12, y: 24, width: 145, label: "app/page.tsx" },
    { x: 203, y: 24, width: 145, label: "components/map.tsx" },
    { x: 108, y: 158, width: 145, label: "lib/graph.ts" },
  ];

  return (
    <div className="relative h-[300px] overflow-hidden rounded-lg border border-border bg-background bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:28px_28px] xl:h-[320px]">
      <div className="absolute inset-0 bg-background/78" />
      <svg aria-hidden="true" viewBox="0 0 360 260" className="absolute inset-x-0 top-4 h-[260px] w-full xl:top-6" fill="none">
        <m.path
          d="M157 54C178 54 183 54 203 54M276 84C276 126 244 162 231 172M133 172C100 148 70 116 83 84"
          className="stroke-border"
          strokeWidth="1.5"
          initial={reduceMotion ? false : { pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true, amount: 0.7 }}
          transition={{ duration: 1.4, ease: "easeInOut", delay: 0.2 }}
        />
        <m.path
          d="M157 54C178 54 183 54 203 54M276 84C276 126 244 162 231 172"
          className="stroke-imports"
          strokeWidth="2"
          strokeDasharray="5 6"
          initial={reduceMotion ? false : { strokeDashoffset: 0 }}
          whileInView={reduceMotion ? undefined : { strokeDashoffset: -44 }}
          viewport={{ once: false, amount: 0.7 }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "linear" }}
        />
        {nodes.map((node, index) => (
          <m.g
            key={node.label}
            initial={reduceMotion ? false : { opacity: 0, scale: 0.92 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, amount: 0.7 }}
            transition={{ duration: 0.3, delay: 0.35 + index * 0.16 }}
            style={{ transformOrigin: `${node.x + node.width / 2}px ${node.y + 30}px` }}
          >
            <rect x={node.x} y={node.y} width={node.width} height="60" className="fill-surface stroke-border" />
            <circle cx={node.x + 15} cy={node.y + 17} r="3.5" className={index === 1 ? "fill-imports" : "fill-muted-foreground"} />
            <text x={node.x + 25} y={node.y + 21} className="fill-foreground font-mono text-[9px]">{node.label}</text>
            <rect x={node.x + 14} y={node.y + 39} width="92" height="4" rx="2" className="fill-border" />
            <rect x={node.x + 14} y={node.y + 48} width="61" height="4" rx="2" className="fill-border" />
          </m.g>
        ))}
      </svg>
    </div>
  );
}

function GroundedExplanation({ reduceMotion }: { reduceMotion: boolean | null }) {
  const lines = [
    ["Directly affected", "components/map.tsx"],
    ["Two levels downstream", "app/page.tsx"],
    ["Evidence", "2 resolved imports"],
  ];

  return (
    <div className="min-h-[300px] overflow-hidden rounded-lg border border-border bg-background xl:min-h-[320px]">
      <div className="p-5 xl:p-6">
        <p className="max-w-[34ch] text-sm leading-6 text-foreground">Changing <span className="font-mono text-xs text-imports">lib/graph.ts</span> reaches these files through verified imports:</p>
        <dl className="mt-5 border-l-2 border-imports pl-4">
          {lines.map(([label, value], index) => (
            <m.div
              key={label}
              className="mb-4 last:mb-0"
              initial={reduceMotion ? false : { opacity: 0, y: 5 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.8 }}
              transition={{ duration: 0.3, delay: 0.45 + index * 0.18 }}
            >
              <dt className="text-[11px] text-muted-foreground">{label}</dt>
              <dd className="mt-1 font-mono text-[11px] text-foreground xl:text-xs">{value}</dd>
            </m.div>
          ))}
        </dl>
        <m.div
          className="mt-5 h-px bg-border"
          initial={reduceMotion ? false : { scaleX: 0 }}
          whileInView={{ scaleX: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.8 }}
          style={{ transformOrigin: "left" }}
        />
        <p className="mt-3 font-mono text-[10px] text-muted-foreground">No inferred connections</p>
      </div>
    </div>
  );
}

const artifacts = [SourceTree, ResolvedImports, GroundedExplanation];

export default function HowItWorks({ features = defaultFeatures, className = "" }: HowItWorksProps) {
  const reduceMotion = useReducedMotion();
  const steps = features.slice(0, 3);

  return (
    <LazyMotion features={domAnimation}>
      <div className={`relative ${className}`}>
        <div className="grid gap-5 xl:grid-cols-[0.95fr_1.1fr_0.95fr]">
          {steps.map((step, index) => {
            const Artifact = artifacts[index];
            return (
              <m.article
                key={step.title}
                className="relative overflow-hidden rounded-xl border border-border bg-surface p-5 shadow-[0_18px_45px_-38px_color-mix(in_oklch,var(--foreground)_45%,transparent)] sm:p-7 xl:p-8"
                initial={reduceMotion ? false : { opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.25 }}
                transition={{ duration: 0.45, delay: index * 0.16 }}
              >
                <header className="mb-7 flex items-center gap-3.5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-full border border-imports/35 bg-imports/10 font-mono text-xs font-semibold text-imports">{index + 1}</span>
                  <h3 className="text-base font-semibold tracking-[-0.015em] xl:text-lg">{step.title}</h3>
                </header>
                <Artifact reduceMotion={reduceMotion} />
              </m.article>
            );
          })}
        </div>
      </div>
    </LazyMotion>
  );
}
