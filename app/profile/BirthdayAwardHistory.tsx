"use client";

import { useEffect, useState } from "react";

type Award = {
  id: string;
  awarded_year: number;
  awarded_at: string;
  coins_awarded: number;
};

export default function BirthdayAwardHistory() {
  const [awards, setAwards] = useState<Award[]>([]);

  useEffect(() => {
    fetch("/api/birthday-awards")
      .then((r) => r.json())
      .then((d) => setAwards(d.awards ?? []));
  }, []);

  if (awards.length === 0) return null;

  return (
    <section className="rounded-xl border border-[rgba(120,120,120,0.45)] bg-[rgba(120,120,120,0.18)] p-5 space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-widest text-neutral-400">
        Birthday Gifts
      </h2>
      <ul className="space-y-2">
        {awards.map((a) => {
          const date = new Date(a.awarded_at);
          const formatted = date.toLocaleDateString("en-US", {
            month: "long",
            day: "numeric",
            year: "numeric",
          });
          return (
            <li key={a.id} className="flex items-center gap-2 text-sm text-neutral-200">
              <span className="text-neutral-400">{a.awarded_year}</span>
              <span className="text-neutral-500">—</span>
              <span>{a.coins_awarded} bloom coins awarded on {formatted}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
