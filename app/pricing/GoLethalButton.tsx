"use client";

import { useRouter } from "next/navigation";

export default function GoLethalButton() {
  const router = useRouter();
  return (
    <button className="pricing-btn" onClick={() => router.push("/subscription")}>
      Go Lethal
    </button>
  );
}
