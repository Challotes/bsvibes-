"use client";

import { useCallback, useState } from "react";

export type CurrencyMode = "noob" | "goat";

const STORAGE_KEY = "bsvibes_currency_mode";

/**
 * Toggle between Noob Mode (dollars) and Goat Mode (sats).
 * Persisted in localStorage.
 */
export function useCurrencyMode(): {
  mode: CurrencyMode;
  toggle: () => void;
  isGoat: boolean;
} {
  const [mode, setMode] = useState<CurrencyMode>(() => {
    if (typeof window === "undefined") return "noob";
    return (localStorage.getItem(STORAGE_KEY) as CurrencyMode) || "noob";
  });

  const toggle = useCallback(() => {
    setMode((prev) => {
      const next = prev === "noob" ? "goat" : "noob";
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  return { mode, toggle, isGoat: mode === "goat" };
}
