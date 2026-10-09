"use client";

import {
  useEffect,
  useId,
  useRef,
  type RefObject,
} from "react";
import { motion, useReducedMotion } from "motion/react";

export interface AnimatedBeamProps {
  className?: string;
  containerRef: RefObject<HTMLElement | null>;
  fromRef: RefObject<HTMLElement | null>;
  toRef: RefObject<HTMLElement | null>;
  curvature?: number;
  reverse?: boolean;
  pathColor?: string;
  pathWidth?: number;
  pathOpacity?: number;
  gradientStartColor?: string;
  gradientStopColor?: string;
  delay?: number;
  duration?: number;
  startXOffset?: number;
  startYOffset?: number;
  endXOffset?: number;
  endYOffset?: number;
}

export function AnimatedBeam({
  className,
  containerRef,
  fromRef,
  toRef,
  curvature = 0,
  reverse = false,
  duration = 5,
  delay = 0,
  pathColor = "var(--border)",
  pathWidth = 2,
  pathOpacity = 0.8,
  gradientStartColor = "var(--imports)",
  gradientStopColor = "var(--imported-by)",
  startXOffset = 0,
  startYOffset = 0,
  endXOffset = 0,
  endYOffset = 0,
}: AnimatedBeamProps) {
  const id = useId();
  const svgRef = useRef<SVGSVGElement>(null);
  const pathRefs = useRef<(SVGPathElement | null)[]>([]);
  const shouldReduceMotion = useReducedMotion();
  const gradientCoordinates = reverse
    ? { x1: ["90%", "-10%"], x2: ["100%", "0%"] }
    : { x1: ["10%", "110%"], x2: ["0%", "100%"] };

  useEffect(() => {
    const updatePath = () => {
      if (!containerRef.current || !fromRef.current || !toRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const fromRect = fromRef.current.getBoundingClientRect();
      const toRect = toRef.current.getBoundingClientRect();
      const startX = fromRect.left - containerRect.left + fromRect.width / 2 + startXOffset;
      const startY = fromRect.top - containerRect.top + fromRect.height / 2 + startYOffset;
      const endX = toRect.left - containerRect.left + toRect.width / 2 + endXOffset;
      const endY = toRect.top - containerRect.top + toRect.height / 2 + endYOffset;
      const path = `M ${startX},${startY} Q ${(startX + endX) / 2},${startY - curvature} ${endX},${endY}`;

      svgRef.current?.setAttribute("viewBox", `0 0 ${containerRect.width} ${containerRect.height}`);
      pathRefs.current.forEach((pathElement) => pathElement?.setAttribute("d", path));
    };

    const resizeObserver = new ResizeObserver(updatePath);
    if (containerRef.current) resizeObserver.observe(containerRef.current);
    updatePath();

    return () => resizeObserver.disconnect();
  }, [containerRef, curvature, endXOffset, endYOffset, fromRef, startXOffset, startYOffset, toRef]);

  return (
    <svg
      ref={svgRef}
      aria-hidden="true"
      fill="none"
      width="100%"
      height="100%"
      preserveAspectRatio="none"
      className={`pointer-events-none absolute inset-0 ${className ?? ""}`}
    >
      <path
        ref={(element) => { pathRefs.current[0] = element; }}
        stroke={pathColor}
        strokeWidth={pathWidth}
        strokeOpacity={pathOpacity}
        strokeLinecap="round"
      />
      {!shouldReduceMotion && (
        <path
          ref={(element) => { pathRefs.current[1] = element; }}
          strokeWidth={pathWidth}
          stroke={`url(#${id})`}
          strokeLinecap="round"
        />
      )}
      <defs>
        <motion.linearGradient
          id={id}
          gradientUnits="userSpaceOnUse"
          initial={{ x1: "0%", x2: "0%", y1: "0%", y2: "0%" }}
          animate={{
            x1: gradientCoordinates.x1,
            x2: gradientCoordinates.x2,
            y1: ["0%", "0%"],
            y2: ["0%", "0%"],
          }}
          transition={{ delay, duration, ease: [0.16, 1, 0.3, 1], repeat: Infinity }}
        >
          <stop stopColor={gradientStartColor} stopOpacity="0" />
          <stop stopColor={gradientStartColor} />
          <stop offset="32.5%" stopColor={gradientStopColor} />
          <stop offset="100%" stopColor={gradientStopColor} stopOpacity="0" />
        </motion.linearGradient>
      </defs>
    </svg>
  );
}
