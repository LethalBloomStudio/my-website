"use client";

import { useMemo } from "react";

// Shared client-side store for System A (notification_read_keys) read-state.
// Consolidates what were three independent implementations
// (notifications/page.tsx, NotificationButton.tsx, MobileNav.tsx) into one
// module-level source of truth: one "notif-badge-refresh" event now results
// in one shared network fetch instead of three independent ones, and the
// optimistic/pending write-tracking from commit 95563ee only has to live in
// one place instead of being reimplemented per consumer.

const readKeySet = new Set<string>();
// Keys with a mark-as-read POST in flight (added optimistically, not yet
// confirmed by the server). A GET that resolves while a write is still
// pending must not drop these from readKeySet — otherwise a just-read item
// can flip back to "unread" once the fetch response lands.
const pendingReadKeysRef = new Set<string>();

// De-dupes concurrent load() calls (e.g. NotificationButton and MobileNav
// both mounted and both reacting to the same event) into a single fetch.
let inFlightLoad: Promise<Set<string>> | null = null;

function cacheKeyFor(userId: string) {
  return `lbs-notif-read-keys:${userId}`;
}

async function fetchReadKeys(userId: string): Promise<Set<string>> {
  // Populate in-memory read-key set from DB (single source of truth), retrying a
  // couple times on failure and falling back to the last known-good cached copy
  // rather than an empty set — an empty set makes every previously-read item
  // look unread again, which is worse than briefly-stale-but-correct data.
  const readKeysCacheKey = cacheKeyFor(userId);
  const retryDelaysMs = [0, 500, 1500];
  let fetchedKeys: string[] | null = null;
  for (let attempt = 0; attempt < retryDelaysMs.length; attempt++) {
    if (retryDelaysMs[attempt] > 0) {
      await new Promise((resolve) => setTimeout(resolve, retryDelaysMs[attempt]));
    }
    try {
      const rkRes = await fetch("/api/notifications/read-keys");
      if (rkRes.ok) {
        const rkData = (await rkRes.json()) as { keys: string[] };
        fetchedKeys = rkData.keys;
        break;
      }
      console.error("[READ-KEYS-FETCH-FAILED] non-200 response", rkRes.status, rkRes.statusText, `attempt ${attempt + 1}/${retryDelaysMs.length}`);
    } catch (err) {
      console.error("[READ-KEYS-FETCH-FAILED] fetch threw", err, `attempt ${attempt + 1}/${retryDelaysMs.length}`);
    }
  }

  if (fetchedKeys) {
    // Union with any still-unconfirmed optimistic keys so a fetch that
    // started before markOneAsRead/markAllAsRead's POST committed can't
    // clobber that optimistic read state.
    const merged = new Set([...fetchedKeys, ...pendingReadKeysRef]);
    readKeySet.clear();
    merged.forEach((k) => readKeySet.add(k));
    try {
      localStorage.setItem(readKeysCacheKey, JSON.stringify(fetchedKeys));
    } catch {
      // localStorage may be unavailable (private browsing, quota) - safe to ignore
    }
  } else {
    let cachedKeys: string[] | null = null;
    try {
      const raw = localStorage.getItem(readKeysCacheKey);
      cachedKeys = raw ? (JSON.parse(raw) as string[]) : null;
    } catch {
      cachedKeys = null;
    }
    if (cachedKeys && cachedKeys.length > 0) {
      const merged = new Set([...cachedKeys, ...pendingReadKeysRef]);
      readKeySet.clear();
      merged.forEach((k) => readKeySet.add(k));
      console.error("[READ-KEYS-FETCH-FAILED] all retries failed — using cached read-keys", cachedKeys.length, "keys");
    } else {
      console.error("[READ-KEYS-FETCH-FAILED] all retries failed — no cache available (empty or first-ever load)");
    }
  }

  return readKeySet;
}

export function loadReadKeys(userId: string): Promise<Set<string>> {
  if (inFlightLoad) return inFlightLoad;
  inFlightLoad = fetchReadKeys(userId).finally(() => {
    inFlightLoad = null;
  });
  return inFlightLoad;
}

export function isKeyRead(key: string): boolean {
  return readKeySet.has(key);
}

// Test-only: clears module-level state so tests don't leak into each other.
// Never called from production code paths.
export function __resetForTests() {
  readKeySet.clear();
  pendingReadKeysRef.clear();
  inFlightLoad = null;
}

export function markOneAsRead(key: string) {
  if (readKeySet.has(key)) return;
  readKeySet.add(key);
  pendingReadKeysRef.add(key);
  fetch("/api/notifications/read-keys", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keys: [key] }),
  })
    .then((res) => {
      if (!res.ok) throw new Error(`read-keys POST responded ${res.status}`);
      pendingReadKeysRef.delete(key);
    })
    .catch((err) => {
      console.error("[READ-KEYS-POST-FAILED] markOneAsRead", key, err);
      pendingReadKeysRef.delete(key);
      readKeySet.delete(key);
    });
}

export function markAllAsRead(keys: string[]) {
  const newKeys = keys.filter((k) => !readKeySet.has(k));
  if (newKeys.length === 0) return;
  newKeys.forEach((k) => {
    readKeySet.add(k);
    pendingReadKeysRef.add(k);
  });
  void fetch("/api/notifications/read-keys", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ keys: newKeys }),
  })
    .then((res) => {
      if (!res.ok) throw new Error(`read-keys POST responded ${res.status}`);
      newKeys.forEach((k) => pendingReadKeysRef.delete(k));
    })
    .catch((err) => {
      console.error("[READ-KEYS-POST-FAILED] markAllAsRead", newKeys, err);
      newKeys.forEach((k) => {
        pendingReadKeysRef.delete(k);
        readKeySet.delete(k);
      });
    });
}

export function useNotificationReadKeys() {
  return useMemo(
    () => ({ isKeyRead, load: loadReadKeys, markOneAsRead, markAllAsRead }),
    []
  );
}
