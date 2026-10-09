export function HeroDependencyMap() {
  return (
    <div className="relative h-[360px] w-full overflow-hidden sm:h-[430px]">
      <div className="absolute inset-0 opacity-45 [background-image:linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] [background-size:32px_32px]" />
      <svg aria-hidden="true" viewBox="0 0 620 430" className="absolute inset-0 h-full w-full" fill="none">
        <g className="stroke-border" strokeWidth="1.2">
          <path d="M126 217C194 217 186 104 267 104M126 217h141M126 217c70 0 65 112 141 112M355 104h99M355 217h99M355 329h99" />
        </g>
        <g className="stroke-imports" strokeWidth="2">
          <path d="M126 217C194 217 186 104 267 104M126 217h141M126 217c70 0 65 112 141 112" />
        </g>
        <g className="fill-imports">
          <path d="m257 99 10 5-10 5ZM257 212l10 5-10 5ZM257 324l10 5-10 5Z" />
        </g>
      </svg>

      <div className="absolute left-[4%] top-[43%] w-[122px] border border-imports/60 bg-surface px-3 py-3 sm:left-[7%] sm:w-[150px]">
        <div className="flex items-center gap-2"><span className="size-2 bg-imports" /><span className="h-1.5 w-16 bg-foreground/75" /></div>
        <div className="mt-2 h-1 w-20 bg-muted" />
      </div>

      {["top-[14%]", "top-[43%]", "top-[72%]"].map((position) => (
        <div key={position} className={`absolute left-[43%] w-[88px] border border-border bg-surface px-2.5 py-3 sm:w-[104px] ${position}`}>
          <div className="flex items-center gap-2"><span className="size-1.5 bg-border" /><span className="h-1.5 w-10 bg-foreground/65" /></div>
          <div className="mt-2 h-1 w-12 bg-muted" />
        </div>
      ))}

      {["top-[14%]", "top-[43%]", "top-[72%]"].map((position) => (
        <div key={position} className={`absolute right-[3%] w-[88px] border border-border bg-surface px-2.5 py-3 sm:right-[7%] sm:w-[104px] ${position}`}>
          <div className="flex items-center gap-2"><span className="size-1.5 bg-border" /><span className="h-1.5 w-9 bg-foreground/45" /></div>
          <div className="mt-2 h-1 w-14 bg-muted" />
        </div>
      ))}

      <div className="absolute bottom-3 left-3 flex items-center gap-4 bg-background/80 px-2 py-1.5 font-mono text-[9px] text-muted">
        <span className="flex items-center gap-1.5"><span className="h-px w-4 bg-imports" /> imports</span>
        <span>6 resolved / 0 guessed</span>
      </div>
    </div>
  );
}
