export function hasYouthAudienceCategory(
  categories: string[] | null | undefined,
  genre: string | null | undefined,
) {
  const values = categories && categories.length > 0 ? categories : genre ? [genre] : [];
  return values.some((c) => {
    const v = c.trim().toLowerCase();
    return v.startsWith("ya ") || v.startsWith("mg ");
  });
}

