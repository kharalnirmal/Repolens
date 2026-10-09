"use client";

import { LazyMotion, domAnimation, m, useReducedMotion } from "motion/react";

export function EvidenceCoverageIllustration() {
  const reduceMotion = useReducedMotion();

  return (
    <LazyMotion features={domAnimation}>
      <figure className="relative mx-auto aspect-[5/4] w-full max-w-[620px]" aria-labelledby="evidence-illustration-caption">
        <svg viewBox="0 0 620 496" className="h-full w-full overflow-visible" fill="none">
          <path d="M116 248C190 248 190 126 278 126M116 248C190 248 198 248 278 248" className="stroke-border" strokeWidth="8" strokeLinecap="round" />
          <m.path
            d="M116 248C190 248 190 126 278 126M116 248C190 248 198 248 278 248"
            className="stroke-imports"
            strokeWidth="2.5"
            strokeLinecap="round"
            initial={reduceMotion ? false : { pathLength: 0 }}
            whileInView={{ pathLength: 1 }}
            viewport={{ once: true, amount: 0.55 }}
            transition={{ duration: 0.85, ease: "easeOut" }}
          />
          <m.path
            d="M116 248C194 248 194 370 278 370"
            className="stroke-muted-foreground/55"
            strokeWidth="2"
            strokeLinecap="round"
            strokeDasharray="7 9"
            initial={reduceMotion ? false : { pathLength: 0 }}
            whileInView={{ pathLength: 0.72 }}
            viewport={{ once: true, amount: 0.55 }}
            transition={{ duration: 0.75, delay: 0.18, ease: "easeOut" }}
          />

          <m.g initial={reduceMotion ? false : { opacity: 0, scale: 0.8 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true, amount: 0.55 }} transition={{ duration: 0.3 }} style={{ transformOrigin: "116px 248px" }}>
            <circle cx="116" cy="248" r="42" className="fill-background stroke-foreground/70" strokeWidth="2" />
            <path d="M97 234h38M97 246h27M97 258h33" className="stroke-foreground/55" strokeWidth="3" strokeLinecap="round" />
          </m.g>

          {[
            { cy: 126, delay: 0.56 },
            { cy: 248, delay: 0.68 },
          ].map(({ cy, delay }) => (
            <m.g key={cy} initial={reduceMotion ? false : { opacity: 0, scale: 0.8 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true, amount: 0.55 }} transition={{ duration: 0.3, delay }} style={{ transformOrigin: `318px ${cy}px` }}>
              <rect x="278" y={cy - 34} width="80" height="68" rx="8" className="fill-surface stroke-imports" strokeWidth="2" />
              <path d={`M294 ${cy - 13}h44M294 ${cy}h30M294 ${cy + 13}h38`} className="stroke-foreground/45" strokeWidth="3" strokeLinecap="round" />
              <circle cx="358" cy={cy} r="5" className="fill-imports" />
            </m.g>
          ))}

          <m.g initial={reduceMotion ? false : { opacity: 0 }} whileInView={{ opacity: 1 }} viewport={{ once: true, amount: 0.55 }} transition={{ duration: 0.3, delay: 0.75 }}>
            <circle cx="257" cy="350" r="6" className="fill-background stroke-muted-foreground" strokeWidth="2" />
            <path d="m273 354 18 18m0-18-18 18" className="stroke-muted-foreground" strokeWidth="2" strokeLinecap="round" />
            <rect x="316" y="336" width="86" height="68" rx="8" className="fill-transparent stroke-border" strokeWidth="2" strokeDasharray="5 7" />
          </m.g>

          <m.path
            d="M358 126C430 126 430 187 494 187M358 248C430 248 430 209 494 209"
            className="stroke-imports"
            strokeWidth="2.5"
            strokeLinecap="round"
            initial={reduceMotion ? false : { pathLength: 0 }}
            whileInView={{ pathLength: 1 }}
            viewport={{ once: true, amount: 0.55 }}
            transition={{ duration: 0.7, delay: 0.78, ease: "easeOut" }}
          />
          <m.g initial={reduceMotion ? false : { opacity: 0, scale: 0.85 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true, amount: 0.55 }} transition={{ duration: 0.35, delay: 1.15 }} style={{ transformOrigin: "494px 198px" }}>
            <circle cx="494" cy="198" r="43" className="fill-background stroke-imports" strokeWidth="2.5" />
            <circle cx="494" cy="198" r="9" className="fill-imports" />
          </m.g>
        </svg>
        <figcaption id="evidence-illustration-caption" className="sr-only">
          Two imports resolve to real files and join the graph. A third unresolved import stops before the missing file and remains visible.
        </figcaption>
      </figure>
    </LazyMotion>
  );
}
