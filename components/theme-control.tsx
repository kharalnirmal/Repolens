"use client";

import { useEffect, useRef } from "react";

type Theme = "system" | "light" | "dark";

const storageKey = "repolens-theme";

function isTheme(value: string | null): value is Theme {
  return value === "system" || value === "light" || value === "dark";
}

export function ThemeControl() {
  const selectRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    const savedTheme = localStorage.getItem(storageKey);
    if (selectRef.current && isTheme(savedTheme)) {
      selectRef.current.value = savedTheme;
    }
  }, []);

  function setTheme(theme: Theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(storageKey, theme);
  }

  return (
    <label className="flex items-center gap-1.5 text-xs text-muted">
      <span className="sr-only">Theme</span>
      <select
        ref={selectRef}
        defaultValue="system"
        aria-label="Theme"
        onChange={(event) => setTheme(event.target.value as Theme)}
        className="h-7 rounded border border-border bg-surface-muted px-2 text-xs text-foreground outline-none focus:border-accent"
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
      </select>
    </label>
  );
}
