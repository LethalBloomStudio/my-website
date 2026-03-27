"use client";

import { useState } from "react";

export default function NewsletterSection() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || status === "loading") return;

    setStatus("loading");
    setErrorMsg("");

    try {
      const body = new URLSearchParams({
        "fields[email]": email,
        "ml-submit": "1",
        anticsrf: "true",
      });

      const res = await fetch(
        "https://assets.mailerlite.com/jsonp/2217666/forms/182830311116113348/subscribe",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: body.toString(),
        }
      );

      if (res.ok) {
        setStatus("success");
        setEmail("");
      } else {
        setStatus("error");
        setErrorMsg("Something went wrong. Please try again.");
      }
    } catch {
      setStatus("error");
      setErrorMsg("Something went wrong. Please try again.");
    }
  }

  return (
    <section className="mt-6 rounded-2xl border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.13)] p-6 sm:p-8">
      {status === "success" ? (
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Thank you!</h2>
          <p className="mt-2 text-sm text-neutral-300">You&apos;ve been added to the Lethal Bloom community newsletter.</p>
        </div>
      ) : (
        <>
          <h2 className="text-2xl font-semibold tracking-tight">Newsletter</h2>
          <p className="mt-1 text-sm text-neutral-400">
            Stay connected. Get occasional updates, featured stories, and highlights from your Lethal Bloom community.
          </p>

          <form onSubmit={handleSubmit} className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="h-10 flex-1 rounded-lg border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.1)] px-3 text-sm text-neutral-100 placeholder-neutral-500 outline-none focus:border-[rgba(120,120,120,0.8)] focus:ring-0"
            />
            <button
              type="submit"
              disabled={status === "loading"}
              className="h-10 rounded-lg border border-[rgba(120,120,120,0.6)] bg-[rgba(120,120,120,0.25)] px-5 text-sm font-medium text-neutral-100 hover:bg-[rgba(120,120,120,0.35)] disabled:opacity-50 transition"
            >
              {status === "loading" ? "Subscribing…" : "Subscribe"}
            </button>
          </form>

          {status === "error" && (
            <p className="mt-2 text-sm text-red-400">{errorMsg}</p>
          )}
        </>
      )}
    </section>
  );
}
