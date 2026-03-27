"use client";

import { useState } from "react";
import { useParams } from "next/navigation";

export default function ParentConsentPage() {
  const params = useParams<{ token: string }>();
  const token = Array.isArray(params?.token) ? params.token[0] : params?.token ?? "";
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function approve() {
    if (loading || !token) return;
    setLoading(true);
    setMsg(null);

    const res = await fetch("/api/parent-consent/approve", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const data = (await res.json()) as { error?: string; alreadyApproved?: boolean };
    setLoading(false);

    if (!res.ok) {
      setMsg(data.error ?? "Approval failed.");
      return;
    }

    if (data.alreadyApproved) {
      setMsg("This request was already approved. The youth account can sign in now.");
      return;
    }

    setMsg("Approved successfully. The youth account can now sign in.");
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(120,120,120,0.18),transparent_50%),#0a0814] text-neutral-100">
      <div className="mx-auto max-w-xl px-6 py-20">
        <section className="rounded-2xl border border-[rgba(120,120,120,0.5)] bg-[rgba(20,20,20,0.92)] p-6 shadow-xl shadow-[rgba(120,120,120,0.18)]">
          <h1 className="text-2xl font-semibold">Parent Authorization</h1>
          <p className="mt-2 text-sm text-neutral-300">
            Approve this request to allow the youth profile to use the app.
          </p>

          <button
            onClick={approve}
            disabled={loading || !token}
            className="mt-5 h-11 rounded-lg border border-[rgba(120,120,120,0.9)] bg-[#787878] px-4 text-sm font-medium text-white hover:bg-[#606060] disabled:opacity-60"
          >
            {loading ? "Approving..." : "Approve Access"}
          </button>

          {msg ? (
            <p className="mt-4 rounded-lg border border-neutral-800 bg-neutral-900/70 p-3 text-sm text-neutral-200">{msg}</p>
          ) : null}
        </section>
      </div>
    </main>
  );
}

