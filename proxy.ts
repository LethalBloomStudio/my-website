import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

function calculateAge(dob: string | null): number | null {
  if (!dob) return null;
  const birth = new Date(`${dob}T00:00:00`);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const beforeBirthday =
    now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return Number.isNaN(age) ? null : age;
}

export async function proxy(req: NextRequest) {
  const pathname = req.nextUrl.pathname;
  const host = req.headers.get("host") ?? "";
  const enforceYouthGate =
    host.includes("localhost:3000") || host.includes("127.0.0.1:3000") || process.env.ENFORCE_YOUTH_GATE === "true";
  const publicPaths = [
    "/sign-in",
    "/sign-up",
    "/check-email",
    "/forgot-password",
    "/reset-password",
    "/parent-consent",
    "/auth",
  ];

  const res = NextResponse.next({ request: { headers: req.headers } });

  if (!enforceYouthGate) {
    return res;
  }

  if (publicPaths.some((p) => pathname.startsWith(p))) {
    return res;
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return res;
  }

  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return req.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              req.cookies.set(name, value);
              res.cookies.set(name, value, options);
            });
          },
        },
      }
    );

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return res;
    }

    const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
    const metadataDob = typeof metadata.dob === "string" ? metadata.dob : null;
    const metadataConsent = typeof metadata.parental_consent === "boolean" ? metadata.parental_consent : null;

    const { data: account } = await supabase
      .from("accounts")
      .select("age_category, parental_consent, dob")
      .eq("user_id", user.id)
      .maybeSingle();

    const dob = (account?.dob as string | null | undefined) ?? metadataDob;
    const derivedAge = calculateAge(dob ?? null);
    const derivedCategory =
      derivedAge === null
        ? null
        : derivedAge < 13
        ? "under_13"
        : derivedAge < 18
        ? "youth_13_17"
        : "adult_18_plus";

    const ageCategory = (account?.age_category as string | null | undefined) ?? derivedCategory;
    const parentalConsent =
      typeof account?.parental_consent === "boolean"
        ? account.parental_consent
        : metadataConsent !== null
        ? metadataConsent
        : false;

    if (ageCategory === "youth_13_17" && !parentalConsent) {
      const url = req.nextUrl.clone();
      url.pathname = "/parent-consent";
      url.search = "";
      const redirectRes = NextResponse.redirect(url);
      res.cookies.getAll().forEach((cookie) => {
        redirectRes.cookies.set(cookie);
      });
      return redirectRes;
    }
  } catch (err) {
    console.error("proxy youth gate error", err);
    return res;
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.json|api).*)"],
};
