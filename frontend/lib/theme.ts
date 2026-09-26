"use client";

import { useEffect, useState } from "react";

export type Theme = "light" | "dark" | "projector";
export const THEMES: { id: Theme; label: string }[] = [
  { id: "light", label: "Light" },
  { id: "dark", label: "Dark" },
  { id: "projector", label: "Projector" },
];

const KEY = "optiteach_theme";

/** Runs before first paint (inlined in <head>) so the page never flashes the wrong theme. */
export const THEME_BOOTSTRAP = `try{var t=localStorage.getItem("${KEY}");if(t==="dark"||t==="projector"||t==="light")document.documentElement.dataset.theme=t;}catch(e){}`;

export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>("light");

  useEffect(() => {
    const current = document.documentElement.dataset.theme as Theme | undefined;
    if (current) setThemeState(current);
  }, []);

  const setTheme = (t: Theme) => {
    document.documentElement.dataset.theme = t;
    setThemeState(t);
    try {
      localStorage.setItem(KEY, t);
    } catch {
      /* theme then lasts for this page load only */
    }
  };

  return [theme, setTheme];
}
