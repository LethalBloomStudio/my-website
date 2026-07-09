import assert from "node:assert";
import { afterEach, describe, it } from "node:test";
import {
  __resetForTests,
  isKeyRead,
  loadReadKeys,
  markOneAsRead,
} from "../lib/useNotificationReadKeys.ts";

// The plain functions (not the useNotificationReadKeys() hook wrapper) are
// tested directly: the hook itself only wraps them in useMemo, and calling
// React hooks outside a component render throws - there's no React test
// renderer in this repo. The logic under test here doesn't depend on React
// at all, so this covers the real regression-prone code without one.

type MockResponse = { ok: boolean; status: number; statusText: string; json: () => Promise<unknown> };

function jsonResponse(body: unknown, ok = true): MockResponse {
  return { ok, status: ok ? 200 : 500, statusText: ok ? "OK" : "Error", json: async () => body };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

let originalFetch: typeof fetch;

describe("useNotificationReadKeys internals", () => {
  afterEach(() => {
    __resetForTests();
    globalThis.fetch = originalFetch;
  });

  it("regression 95563ee: a GET that resolves while a mark-as-read POST is still pending does not clobber the optimistic key", async () => {
    originalFetch = globalThis.fetch;
    const getDeferred = deferred<MockResponse>();
    const postDeferred = deferred<MockResponse>();

    globalThis.fetch = ((_url: string, opts?: { method?: string }) => {
      return opts?.method === "POST" ? postDeferred.promise : getDeferred.promise;
    }) as unknown as typeof fetch;

    markOneAsRead("feedback-abc"); // optimistic add + fire-and-forget POST, not yet resolved
    assert.equal(isKeyRead("feedback-abc"), true, "optimistic add happens immediately, before any network round trip");

    const loadPromise = loadReadKeys("user-1");
    // The server responds to the GET before the mark-as-read POST has
    // committed - its payload deliberately omits "feedback-abc" to
    // reproduce that exact race.
    getDeferred.resolve(jsonResponse({ keys: ["some-other-key"] }));
    await loadPromise;

    assert.equal(isKeyRead("feedback-abc"), true, "GET must not overwrite the still-pending optimistic key");
    assert.equal(isKeyRead("some-other-key"), true, "server-confirmed keys from the GET are still included");

    // Let the POST succeed and confirm pending tracking is actually cleared
    // (not just readKeySet) by running a later GET that also omits the key -
    // if pendingReadKeysRef still protected it, this would incorrectly keep
    // showing it as read forever regardless of server state.
    postDeferred.resolve(jsonResponse({ ok: true }));
    await flush();

    globalThis.fetch = (() => Promise.resolve(jsonResponse({ keys: [] }))) as unknown as typeof fetch;
    await loadReadKeys("user-1");
    assert.equal(isKeyRead("feedback-abc"), false, "once the POST resolves, pending protection must be released back to plain server state");
  });

  it("rolls back the optimistic key and clears pending state when the mark-as-read POST fails", async () => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = (() => Promise.resolve(jsonResponse({}, false))) as unknown as typeof fetch;

    markOneAsRead("feedback-xyz");
    assert.equal(isKeyRead("feedback-xyz"), true, "optimistic add happens immediately");

    await flush(); // let the failed POST's .catch() run

    assert.equal(isKeyRead("feedback-xyz"), false, "a failed POST must roll back the optimistic key");

    // Confirm pending tracking was cleared too, not just readKeySet: if
    // pendingReadKeysRef still held the key, the union-with-pending logic in
    // loadReadKeys would incorrectly resurrect it despite the rollback.
    globalThis.fetch = (() => Promise.resolve(jsonResponse({ keys: [] }))) as unknown as typeof fetch;
    await loadReadKeys("user-1");
    assert.equal(isKeyRead("feedback-xyz"), false, "pending tracking must also be cleared, not just readKeySet");
  });

  it("concurrent loadReadKeys() calls share a single in-flight fetch instead of firing one each", async () => {
    originalFetch = globalThis.fetch;
    let fetchCallCount = 0;
    const getDeferred = deferred<MockResponse>();
    globalThis.fetch = (() => {
      fetchCallCount++;
      return getDeferred.promise;
    }) as unknown as typeof fetch;

    const p1 = loadReadKeys("user-1");
    const p2 = loadReadKeys("user-1");
    const p3 = loadReadKeys("user-1");

    assert.equal(fetchCallCount, 1, "three concurrent callers must collapse into a single fetch (inFlightLoad de-dupe)");

    getDeferred.resolve(jsonResponse({ keys: ["a", "b"] }));
    const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

    assert.equal(r1, r2, "concurrent callers should resolve to the same Set instance");
    assert.equal(r2, r3, "concurrent callers should resolve to the same Set instance");
    assert.equal(isKeyRead("a"), true);
    assert.equal(isKeyRead("b"), true);

    // A later, non-concurrent call must fetch again (dedupe is only for
    // calls that overlap in time, not a permanent cache).
    const getDeferred2 = deferred<MockResponse>();
    globalThis.fetch = (() => {
      fetchCallCount++;
      return getDeferred2.promise;
    }) as unknown as typeof fetch;
    const p4 = loadReadKeys("user-1");
    getDeferred2.resolve(jsonResponse({ keys: [] }));
    await p4;
    assert.equal(fetchCallCount, 2, "a subsequent call after the first resolved must trigger a fresh fetch");
  });
});
