"use client";

import { useEffect } from "react";

const PING_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const STORAGE_KEY = "lbs_last_ping";

function sendPing() {
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
}

export default function ActivityPing() {
  useEffect(() => {
    // Fire on mount, then every 5 minutes while the user stays in the app.
    // Next.js layouts don't remount between navigations, so the interval
    // is required to keep last_active_at current for long sessions.
    sendPing();
    const interval = setInterval(sendPing, PING_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  return null;
}
