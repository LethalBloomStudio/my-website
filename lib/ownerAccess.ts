export function isOwnerEmail(email: string | null | undefined) {
  if (!email) return false;

  const raw =
    process.env.SITE_OWNER_EMAILS ||
    process.env.NEXT_PUBLIC_SITE_OWNER_EMAILS ||
    process.env.SITE_OWNER_EMAIL ||
    process.env.NEXT_PUBLIC_SITE_OWNER_EMAIL ||
    "";

  const owners = raw
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);

  if (owners.length === 0) return false;
  return owners.includes(email.toLowerCase());
}
