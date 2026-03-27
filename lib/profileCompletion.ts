export type ProfileDraft = {
  pen_name?: string | null;
  avatar_url?: string | null;
  writer_level?: "bloom" | "forge" | "lethal" | null;
  beta_reader_level?: "bloom" | "forge" | "lethal" | null;
  feedback_style?: "gentle" | "balanced" | "direct" | null;
  genres_write?: string[] | null;
  genres_read?: string[] | null;
  publishing_goals?: string | null;
  feedback_areas?: string | null;
};

export function computeProfileComplete(p: ProfileDraft) {
  const has = (v?: string | null) => Boolean(v && v.trim().length > 0);
  const hasList = (v?: string[] | null) => Array.isArray(v) && v.length > 0;

  return Boolean(
    has(p.pen_name) &&
      p.writer_level &&
      p.beta_reader_level &&
      p.feedback_style &&
      hasList(p.genres_write) &&
      hasList(p.genres_read) &&
      has(p.publishing_goals) &&
      has(p.feedback_areas)
  );
}
