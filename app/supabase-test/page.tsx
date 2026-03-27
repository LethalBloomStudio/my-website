"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type TestResult = {
  data: unknown;
  error: { message?: string } | null;
} | null;

export default function SupabaseTestPage() {
  const [result, setResult] = useState<TestResult>(null);
  const [email, setEmail] = useState("");
  const sessionEmail = (() => {
    if (!result || !result.data || typeof result.data !== "object") return null;
    const data = result.data as Record<string, unknown>;
    const session = data.session;
    if (!session || typeof session !== "object") return null;
    const user = (session as Record<string, unknown>).user;
    if (!user || typeof user !== "object") return null;
    const emailValue = (user as Record<string, unknown>).email;
    return typeof emailValue === "string" ? emailValue : null;
  })();

  async function refreshSession() {
    const { data, error } = await supabase.auth.getSession();
    setResult({ data, error });
  }

  async function sendMagicLink() {
    const { data, error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/supabase-test`,
      },
    });
    setResult({ data, error });
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut();
    setResult({ data: { signedOut: true }, error });
  }

  async function addPost() {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    const userId = session?.user?.id;

    const { data, error } = await supabase
      .from("posts")
      .insert({
        title: "Post from the app",
        content: "It lives.",
        user_id: userId,
      })
      .select("*")
      .single();

    setResult({ data, error });
  }

  async function readPosts() {
    const { data, error } = await supabase
      .from("posts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10);

    setResult({ data, error });
  }

  useEffect(() => {
    const load = async () => {
      await refreshSession();
    };
    void load();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void refreshSession();
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  return (
    <main style={{ padding: 24, fontFamily: "system-ui", maxWidth: 640 }}>
      <h1>Supabase Connection Test</h1>

      <div style={{ display: "flex", gap: 8, margin: "16px 0" }}>
        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          style={{ flex: 1, padding: 8 }}
        />
        <button onClick={sendMagicLink} style={{ padding: "8px 12px" }}>
          Send magic link
        </button>
        <button onClick={signOut} style={{ padding: "8px 12px" }}>
          Sign out
        </button>
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <button onClick={refreshSession} style={{ padding: "8px 12px" }}>
          Refresh session
        </button>
        <button onClick={addPost} style={{ padding: "8px 12px" }}>
          Add post
        </button>
        <button onClick={readPosts} style={{ padding: "8px 12px" }}>
          Read posts
        </button>
      </div>

      {result?.error && (
        <p style={{ color: "red", marginTop: 16 }}>
          Error: {result.error.message}
        </p>
      )}

      {sessionEmail && <p style={{ marginTop: 16 }}>Signed in as {sessionEmail}</p>}
    </main>
  );
}
