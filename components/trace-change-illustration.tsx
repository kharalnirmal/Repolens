"use client";

import { LazyMotion, domAnimation, m, useReducedMotion } from "motion/react";

import Folder from "@/components/Folder";

const incomingFiles = ["app/page.tsx", "components/map.tsx"];
const outgoingFiles = ["parser/resolve.ts", "lib/types.ts"];

export function TraceChangeIllustration() {
  const reduceMotion = useReducedMotion();

  return (
    <LazyMotion features={domAnimation}>
      <figure className="relative min-h-[340px] w-full overflow-visible sm:min-h-[360px] lg:translate-x-10 xl:translate-x-[52px]">
        <div
          aria-hidden="true"
          className="absolute inset-x-[12%] top-1/2 h-48 -translate-y-1/2 rounded-full bg-imports/6 blur-3xl"
        />
        <svg
          aria-hidden="true"
          viewBox="0 0 800 360"
          preserveAspectRatio="none"
          className="pointer-events-none absolute inset-0 h-full w-full"
          fill="none"
        >
          <m.path
            d="M310 180C280 164 285 126 252 130C220 134 222 92 188 100C158 107 153 90 126 95M310 180C280 196 285 234 252 230C220 226 222 268 188 260C158 253 153 270 126 265"
            className="stroke-imported-by"
            strokeWidth="1.5"
            initial={reduceMotion ? false : { pathLength: 0, opacity: 0 }}
            whileInView={{ pathLength: 1, opacity: 1 }}
            viewport={{ once: true, amount: 0.55 }}
            transition={{ duration: 0.8, ease: "easeOut" }}
          />
          <m.path
            d="M490 180C520 164 515 126 548 130C580 134 578 92 612 100C642 107 647 90 674 95M490 180C520 196 515 234 548 230C580 226 578 268 612 260C642 253 647 270 674 265"
            className="stroke-imports"
            strokeWidth="1.5"
            initial={reduceMotion ? false : { pathLength: 0, opacity: 0 }}
            whileInView={{ pathLength: 1, opacity: 1 }}
            viewport={{ once: true, amount: 0.55 }}
            transition={{ duration: 0.8, delay: 0.15, ease: "easeOut" }}
          />
        </svg>

        <div className="relative grid min-h-[340px] grid-cols-[1fr_164px_1fr] items-center sm:min-h-[360px] sm:grid-cols-[1fr_250px_1fr]">
          <div className="space-y-[6.25rem]">
            {incomingFiles.map((path, index) => (
              <m.div
                key={path}
                className="relative ml-auto mr-1 flex w-fit flex-col items-end rounded-full border border-imported-by/45 bg-surface/90 px-2.5 py-2 text-right shadow-sm backdrop-blur-sm sm:mr-2 sm:px-4 sm:py-2.5"
                initial={reduceMotion ? false : { opacity: 0, x: 10, scale: 0.92 }}
                whileInView={{ opacity: 1, x: 0, scale: 1 }}
                whileHover={reduceMotion ? undefined : { x: -4 }}
                viewport={{ once: true, amount: 0.8 }}
                transition={{ duration: 0.3, delay: 0.25 + index * 0.14 }}
              >
                <m.span
                  aria-hidden="true"
                  className="absolute -right-1 top-1/2 size-2 -translate-y-1/2 rounded-full bg-imported-by"
                  initial={reduceMotion ? false : { scale: 0 }}
                  whileInView={{ scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.48 + index * 0.14, type: "spring", stiffness: 320, damping: 18 }}
                />
                <span className="whitespace-nowrap font-mono text-[7px] text-foreground sm:text-[10px]">{path}</span>
                <span className="mt-0.5 whitespace-nowrap text-[7px] leading-3 text-muted-foreground sm:text-[9px]">imports this file</span>
              </m.div>
            ))}
          </div>

          <m.div
            className="flex flex-col items-center"
            initial={reduceMotion ? false : { opacity: 0, scale: 0.94 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true, amount: 0.8 }}
            transition={{ duration: 0.4, delay: 0.12, ease: "easeOut" }}
          >
            <div className="flex h-[210px] w-[180px] scale-[0.82] items-center justify-center sm:h-[230px] sm:w-[240px] sm:scale-100">
              <Folder color="var(--imports)" size={2.05} items={["src", "components", "app"]} />
            </div>
            <p className="font-heading text-sm font-semibold tracking-[-0.025em] text-foreground sm:text-base">Your repository</p>
            <p className="mt-2.5 text-center text-[10px] leading-4 text-muted-foreground sm:text-[11px]">Click the folder to inspect it</p>
          </m.div>

          <div className="space-y-[6.25rem]">
            {outgoingFiles.map((path, index) => (
              <m.div
                key={path}
                className="relative ml-1 flex w-fit flex-col rounded-full border border-imports/45 bg-surface/90 px-2.5 py-2 shadow-sm backdrop-blur-sm sm:ml-2 sm:px-4 sm:py-2.5"
                initial={reduceMotion ? false : { opacity: 0, x: -10, scale: 0.92 }}
                whileInView={{ opacity: 1, x: 0, scale: 1 }}
                whileHover={reduceMotion ? undefined : { x: 4 }}
                viewport={{ once: true, amount: 0.8 }}
                transition={{ duration: 0.3, delay: 0.38 + index * 0.14 }}
              >
                <m.span
                  aria-hidden="true"
                  className="absolute -left-1 top-1/2 size-2 -translate-y-1/2 rounded-full bg-imports"
                  initial={reduceMotion ? false : { scale: 0 }}
                  whileInView={{ scale: 1 }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.61 + index * 0.14, type: "spring", stiffness: 320, damping: 18 }}
                />
                <span className="whitespace-nowrap font-mono text-[7px] text-foreground sm:text-[10px]">{path}</span>
                <span className="mt-0.5 whitespace-nowrap text-[7px] leading-3 text-muted-foreground sm:text-[9px]">imported by this file</span>
              </m.div>
            ))}
          </div>
        </div>
        <figcaption className="sr-only">A selected source file between the files that import it and the files it imports.</figcaption>
      </figure>
    </LazyMotion>
  );
}
