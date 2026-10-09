"use client";

import { LazyMotion, domAnimation, m, useReducedMotion } from "motion/react";

export function FrameworkContextIllustration() {
  const reduceMotion = useReducedMotion();

  return (
    <LazyMotion features={domAnimation}>
      <figure className="relative mx-auto aspect-[5/4] w-full max-w-[640px]" aria-labelledby="framework-illustration-caption">
        <div aria-hidden="true" className="absolute inset-[7%] rounded-[2rem] bg-imports/8 blur-3xl" />

        <m.div
          className="absolute left-[4%] top-[7%] h-[72%] w-[78%] overflow-hidden rounded-xl border border-border bg-background/95 shadow-[0_24px_70px_-45px_color-mix(in_oklch,var(--foreground)_55%,transparent)]"
          initial={reduceMotion ? false : { opacity: 0, x: -12, rotate: -3 }}
          whileInView={{ opacity: 1, x: 0, rotate: -3 }}
          viewport={{ once: true, amount: 0.55 }}
          transition={{ duration: reduceMotion ? 0 : 0.45, ease: "easeOut" }}
        >
          <div className="flex h-11 items-center gap-2.5 px-4">
            <span className="size-2 rounded-full bg-imports" />
            <span className="text-[11px] font-medium text-foreground">Parsed structure</span>
            <span className="ml-auto font-mono text-[9px] text-muted-foreground">dependency graph</span>
          </div>
          <div className="absolute inset-x-0 bottom-0 top-11 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:28px_28px] opacity-45" />
          <div className="absolute inset-x-0 bottom-0 top-11 bg-background/72" />
          <svg aria-hidden="true" viewBox="0 0 500 300" preserveAspectRatio="none" className="absolute inset-x-[6%] bottom-[5%] top-[18%] h-[77%] w-[88%]" fill="none">
            <path d="M82 145C145 145 142 64 213 64M82 145h131M82 145c62 0 61 85 131 85M287 64c56 0 55 81 112 81M287 230c56 0 55-85 112-85" className="stroke-border" strokeWidth="8" strokeLinecap="round" />
            <m.path
              d="M82 145C145 145 142 64 213 64M82 145h131M82 145c62 0 61 85 131 85M287 64c56 0 55 81 112 81M287 230c56 0 55-85 112-85"
              className="stroke-imports"
              strokeWidth="2"
              strokeLinecap="round"
              initial={reduceMotion ? { pathLength: 1 } : { pathLength: 0 }}
              whileInView={{ pathLength: 1 }}
              viewport={{ once: true, amount: 0.55 }}
              transition={{ duration: reduceMotion ? 0 : 0.9, delay: 0.15, ease: "easeOut" }}
            />
            {[
              [48, 115, 68, 60],
              [213, 36, 74, 56],
              [213, 117, 74, 56],
              [213, 202, 74, 56],
              [399, 117, 74, 56],
            ].map(([x, y, width, height], index) => (
              <g key={`${x}-${y}`}>
                <rect x={x} y={y} width={width} height={height} rx="7" className="fill-surface stroke-border" strokeWidth="1.5" />
                <circle cx={x + 14} cy={y + 15} r="3.5" className={index === 0 ? "fill-imports" : "fill-muted-foreground/60"} />
                <path d={`M${x + 24} ${y + 15}h${width - 34}M${x + 12} ${y + 33}h${width - 28}M${x + 12} ${y + 43}h${width - 39}`} className="stroke-border" strokeWidth="3" strokeLinecap="round" />
              </g>
            ))}
          </svg>
        </m.div>

        <m.div
          className="absolute bottom-[4%] right-[2%] h-[63%] w-[72%] overflow-hidden rounded-xl border border-imports/45 bg-surface/78 shadow-[0_28px_80px_-42px_color-mix(in_oklch,var(--imports)_50%,transparent)] backdrop-blur-md"
          initial={reduceMotion ? false : { opacity: 0, x: 24, y: 18, rotate: 3 }}
          whileInView={{ opacity: 1, x: 0, y: 0, rotate: 1.5 }}
          viewport={{ once: true, amount: 0.55 }}
          transition={{ duration: reduceMotion ? 0 : 0.55, delay: 0.55, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="flex h-11 items-center px-4">
            <span className="text-[11px] font-semibold text-foreground">Next.js context</span>
            <span className="ml-auto flex items-center gap-1.5 text-[9px] text-muted-foreground"><span className="size-1.5 rounded-full bg-imports" />matched</span>
          </div>

          <div className="relative h-[calc(100%-2.75rem)] px-4 pb-4 sm:px-5 sm:pb-5">
            <svg aria-hidden="true" viewBox="0 0 400 210" preserveAspectRatio="none" className="absolute inset-x-4 bottom-4 top-0 h-[calc(100%-1rem)] w-[calc(100%-2rem)]" fill="none">
              <m.path
                d="M54 46C126 46 128 98 194 98M54 158C126 158 128 110 194 110M234 104H320"
                className="stroke-imports/65"
                strokeWidth="1.5"
                strokeDasharray="4 5"
                initial={reduceMotion ? { pathLength: 1 } : { pathLength: 0 }}
                whileInView={{ pathLength: 1 }}
                viewport={{ once: true, amount: 0.55 }}
                transition={{ duration: reduceMotion ? 0 : 0.65, delay: 0.9, ease: "easeOut" }}
              />
            </svg>

            <div className="absolute left-[7%] top-[9%] rounded-md bg-background/90 px-3 py-2 shadow-[inset_0_0_0_1px_var(--border)]">
              <p className="font-mono text-[9px] text-foreground">page</p>
              <p className="mt-0.5 text-[8px] text-muted-foreground">role</p>
            </div>
            <div className="absolute bottom-[12%] left-[7%] rounded-md bg-background/90 px-3 py-2 shadow-[inset_0_0_0_1px_var(--border)]">
              <p className="font-mono text-[9px] text-foreground">layout</p>
              <p className="mt-0.5 text-[8px] text-muted-foreground">role</p>
            </div>
            <div className="absolute left-[46%] top-[36%] grid size-12 place-items-center rounded-full bg-imports text-white shadow-[0_0_0_8px_color-mix(in_oklch,var(--imports)_10%,transparent)]">
              <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 4h14v16H5zM8 8h8M8 12h5M8 16h7" />
              </svg>
            </div>
            <div className="absolute right-[4%] top-[35%] rounded-full bg-background px-3 py-2 shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--imports)_45%,transparent)]">
              <p className="whitespace-nowrap font-mono text-[8px] text-foreground sm:text-[9px]"><span className="mr-1.5 font-semibold text-imports">GET</span>/api/projects/:id</p>
            </div>
          </div>
        </m.div>

        <figcaption id="framework-illustration-caption" className="sr-only">
          A framework context layer adds file roles and a recovered route above the unchanged parsed dependency structure.
        </figcaption>
      </figure>
    </LazyMotion>
  );
}
