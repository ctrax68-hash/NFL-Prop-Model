"use client";

import { useEffect, useState } from "react";

type Theme = "dark" | "light";
const STORAGE_KEY = "nfl-prop-model.theme";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY) as Theme | null;
    if (stored) {
      setTheme(stored);
      document.documentElement.dataset.theme = stored;
    }
    setMounted(true);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem(STORAGE_KEY, next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      className="grid size-8 shrink-0 place-items-center rounded-[var(--radius-pill)] border bg-[var(--surface-2)] text-xs hover:border-[var(--border-strong)]"
    >
      {/* Render a stable glyph until mounted so SSR markup matches. */}
      {!mounted ? "◐" : theme === "dark" ? "☾" : "☀"}
    </button>
  );
}
