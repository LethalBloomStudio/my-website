"use client";

import { useRouter } from "next/navigation";

export default function CreateBloomButton() {
  const router = useRouter();
  return (
    <button className="pricing-btn" onClick={() => router.push("/sign-up")}>
      Create Bloom Account
    </button>
  );
}
