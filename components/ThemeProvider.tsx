"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";

type Theme = "night" | "day";

interface ThemeCtx {
  theme: Theme;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeCtx>({ theme: "night", toggle: () => {} });

export const useTheme = () => useContext(ThemeContext);

export default function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("night");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("theme") as Theme | null;
      const t: Theme = saved === "day" ? "day" : "night";
      setTheme(t);
      document.documentElement.setAttribute("data-theme", t);
    } catch {
      // localStorage unavailable — stay on night
    }
  }, []);

  function toggle() {
    setTheme((prev) => {
      const next: Theme = prev === "night" ? "day" : "night";
      try {
        localStorage.setItem("theme", next);
      } catch {}
      document.documentElement.setAttribute("data-theme", next);
      return next;
    });
  }

  return (
    <ThemeContext.Provider value={{ theme, toggle }}>
      {children}
    </ThemeContext.Provider>
  );
}
