"use client";

import { useSyncExternalStore } from "react";

const storageKey = "repolens-theme";
const themeChangeEvent = "repolens-theme-change";

function isDarkTheme(): boolean {
  const selected = document.documentElement.dataset.theme;
  return selected === "dark" || (
    selected === "system" && matchMedia("(prefers-color-scheme: dark)").matches
  );
}

function subscribeToTheme(onStoreChange: () => void) {
  const colorScheme = matchMedia("(prefers-color-scheme: dark)");
  colorScheme.addEventListener("change", onStoreChange);
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(themeChangeEvent, onStoreChange);
  return () => {
    colorScheme.removeEventListener("change", onStoreChange);
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(themeChangeEvent, onStoreChange);
  };
}

function SunIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3a6.8 6.8 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}

export function LandingThemeToggle() {
  const isDark = useSyncExternalStore(subscribeToTheme, isDarkTheme, () => false);

  function setDarkTheme(checked: boolean) {
    const nextTheme = checked ? "dark" : "light";
    document.documentElement.dataset.theme = nextTheme;
    localStorage.setItem(storageKey, nextTheme);
    window.dispatchEvent(new Event(themeChangeEvent));
  }

  return (
    <button
      type="button"
      onClick={() => setDarkTheme(!isDark)}
      aria-label={isDark ? "Use light theme" : "Use dark theme"}
      aria-pressed={isDark}
      title={isDark ? "Use light theme" : "Use dark theme"}
      className="group relative grid h-9 w-[68px] grid-cols-2 items-center rounded-full border border-border bg-surface-muted p-1 text-muted-foreground shadow-[inset_0_1px_1px_color-mix(in_oklch,var(--foreground)_5%,transparent)] outline-none transition-colors hover:border-foreground/25 focus-visible:ring-2 focus-visible:ring-imports focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none"
    >
      <span
        aria-hidden="true"
        className={`absolute left-1 top-1 size-[26px] rounded-full border border-border bg-background shadow-sm transition-transform duration-300 ease-[cubic-bezier(.2,.8,.2,1)] motion-reduce:transition-none ${isDark ? "translate-x-8" : "translate-x-0"}`}
      />
      <span className={`relative z-10 grid place-items-center transition-[color,transform] duration-300 motion-reduce:transition-none ${isDark ? "text-muted-foreground" : "rotate-0 text-foreground"}`}>
        <SunIcon />
      </span>
      <span className={`relative z-10 grid place-items-center transition-[color,transform] duration-300 motion-reduce:transition-none ${isDark ? "rotate-0 text-foreground" : "-rotate-12 text-muted-foreground"}`}>
        <MoonIcon />
      </span>
    </button>
  );
}
