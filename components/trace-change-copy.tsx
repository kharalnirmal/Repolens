"use client";

import { LazyMotion, domAnimation, m, useReducedMotion } from "motion/react";

export function TraceChangeCopy() {
  const reduceMotion = useReducedMotion();

  return (
    <LazyMotion features={domAnimation}>
      <div className="lg:pb-4">
        <m.h2
          className="font-heading text-[clamp(2.85rem,5vw,4.6rem)] font-medium leading-[1.02] tracking-[-0.042em] lg:whitespace-nowrap"
          initial={reduceMotion ? false : { opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.65 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          Trace the impact.
        </m.h2>
        <m.p
          className="mt-7 max-w-[58ch] text-[1.05rem] leading-8 text-muted-foreground"
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.65 }}
          transition={{ duration: 0.45, delay: 0.12, ease: "easeOut" }}
        >
          Select a file to see what it imports, what imports it, and what sits two levels downstream. The answer is calculated from the graph already in front of you.
        </m.p>
      </div>
    </LazyMotion>
  );
}
