import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface FloatingPathsBackgroundProps {
  position: number;
  children: ReactNode;
  className?: string;
}

export function FloatingPathsBackground({
  position,
  children,
  className,
}: FloatingPathsBackgroundProps) {
  const paths = Array.from({ length: 36 }, (_, index) => ({
    id: index,
    d: `M-${380 - index * 5 * position} -${189 + index * 6}C-${
      380 - index * 5 * position
    } -${189 + index * 6} -${312 - index * 5 * position} ${216 - index * 6} ${
      152 - index * 5 * position
    } ${343 - index * 6}C${616 - index * 5 * position} ${470 - index * 6} ${
      684 - index * 5 * position
    } ${875 - index * 6} ${684 - index * 5 * position} ${875 - index * 6}`,
    width: 0.5 + index * 0.03,
  }));

  return (
    <div className={cn("relative w-full", className)}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 contain-paint overflow-hidden">
        <svg
          className="h-full w-full text-foreground/65"
          viewBox="0 0 696 316"
          fill="none"
          preserveAspectRatio="xMidYMid slice"
        >
          {paths.map((path) => (
            <path
              key={path.id}
              d={path.d}
              stroke="currentColor"
              strokeWidth={path.width}
              strokeOpacity={0.06 + path.id * 0.012}
            />
          ))}
        </svg>
      </div>
      <div className="relative z-10">{children}</div>
    </div>
  );
}
