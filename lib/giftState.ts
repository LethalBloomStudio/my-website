export type GiftAccountFields = {
  active_gift_membership_id?: string | null;
  gift_access_expires_at?: string | null;
};

function parseGiftExpiry(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function getGiftState(
  row: GiftAccountFields | null | undefined,
  now: Date = new Date(),
) {
  const expiresAt = parseGiftExpiry(row?.gift_access_expires_at);
  const onActiveGift = !!(
    row?.active_gift_membership_id &&
    expiresAt &&
    expiresAt > now
  );
  return { onActiveGift, expiresAt };
}
