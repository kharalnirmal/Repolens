"use client";

import type { ReactNode } from "react";
import { useRef } from "react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react";

import { cn } from "@/lib/utils";

interface ContainerScrollProps {
  titleComponent: ReactNode;
  children: ReactNode;
  className?: string;
}

export function ContainerScroll({
  titleComponent,
  children,
  className,
}: ContainerScrollProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const reducedMotion = useReducedMotion() ?? false;
  const { scrollYProgress } = useScroll({ target: containerRef });
  const smoothProgress = useSpring(scrollYProgress, {
    stiffness: 90,
    damping: 24,
    mass: 0.35,
  });
  const rotate = useTransform(smoothProgress, [0, 1], [14, 0]);
  const scale = useTransform(smoothProgress, [0, 1], [0.94, 1]);
  const translate = useTransform(smoothProgress, [0, 1], [0, -80]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative flex h-[78rem] items-center justify-center px-6 py-12 md:py-20",
        className,
      )}
    >
      <div className="relative w-full" style={{ perspective: "1000px" }}>
        <motion.div
          style={{ translateY: reducedMotion ? 0 : translate }}
          className="mx-auto w-full max-w-[1140px]"
        >
          {titleComponent}
        </motion.div>
        <motion.div
          style={{
            rotateX: reducedMotion ? 0 : rotate,
            scale: reducedMotion ? 1 : scale,
            backfaceVisibility: "hidden",
            willChange: reducedMotion ? "auto" : "transform",
            boxShadow:
              "0 9px 20px rgb(0 0 0 / 0.12), 0 36px 52px rgb(0 0 0 / 0.09), 0 78px 84px rgb(0 0 0 / 0.05)",
          }}
          className="mx-auto mt-14 w-full max-w-[30rem] origin-center rounded-lg border border-border bg-surface-muted p-2 sm:p-3 md:max-w-[1140px]"
        >
          <div className="aspect-[3/5] w-full overflow-hidden rounded-md border border-border bg-black md:aspect-[1917/917]">
            {children}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
