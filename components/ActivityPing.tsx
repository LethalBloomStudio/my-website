"use client";

import { useEffect } from "react";

const PING_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const STORAGE_KEY = "lbs_last_ping";

export default function ActivityPing() {
  useEffect(() => {
    try {
      const last = Number(localStorage.getItem(STORAGE_KEY) ?? "0");
      if (Date.now() - last < PING_INTERVAL_MS) return;
    } catch {
      // localStorage unavailable — proceed with ping
    }

    void fetch("/api/activity/ping", { method: "POST" }).then((r) => {
      if (r.ok) {
        try {
          localStorage.setItem(STORAGE_KEY, String(Date.now()));
        } catch { /* ignore */ }
      }
    });
  }, []);

  return null;
}
