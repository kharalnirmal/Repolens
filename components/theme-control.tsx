"use client";

import { useSyncExternalStore } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Theme = "system" | "light" | "dark";

const storageKey = "repolens-theme";
const themeChangeEvent = "repolens-theme-change";

function isTheme(value: string | null): value is Theme {
  return value === "system" || value === "light" || value === "dark";
}

function getTheme(): Theme {
  const theme = localStorage.getItem(storageKey);
  return isTheme(theme) ? theme : "system";
}

function subscribeToTheme(onStoreChange: () => void) {
  function handleStorage(event: StorageEvent) {
    if (event.key === storageKey) onStoreChange();
  }

  window.addEventListener("storage", handleStorage);
  window.addEventListener(themeChangeEvent, onStoreChange);
  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(themeChangeEvent, onStoreChange);
  };
}

/** Restore the saved theme selection and persist changes to the document and local storage. */
export function ThemeControl() {
  const theme = useSyncExternalStore(subscribeToTheme, getTheme, () => "system");

  function setTheme(theme: Theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(storageKey, theme);
    window.dispatchEvent(new Event(themeChangeEvent));
  }

  return (
    <div className="flex items-center gap-1.5 text-xs text-muted">
      <span className="sr-only">Theme</span>
      <Select
        value={theme}
        onValueChange={(value) => {
          if (isTheme(value)) setTheme(value);
        }}
      >
        <SelectTrigger
          size="sm"
          aria-label="Theme"
          className="h-7 rounded-none border-border bg-surface-muted px-2 text-[10px] text-foreground focus-visible:border-accent focus-visible:ring-0 dark:bg-surface-muted dark:hover:bg-surface-muted"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="min-w-(--anchor-width) rounded-none border border-border bg-surface-muted text-[10px] shadow-none">
          <SelectItem value="system" className="rounded-none text-[10px]">System</SelectItem>
          <SelectItem value="light" className="rounded-none text-[10px]">Light</SelectItem>
          <SelectItem value="dark" className="rounded-none text-[10px]">Dark</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
