import { ALL_MANUSCRIPT_CATEGORIES, YOUTH_ALLOWED_CATEGORIES } from "@/lib/manuscriptOptions";

export const GENRE_OPTIONS = ALL_MANUSCRIPT_CATEGORIES;

export function genreOptionsForAgeCategory(ageCategory: string | null | undefined) {
  if (ageCategory === "youth_13_17") {
    return YOUTH_ALLOWED_CATEGORIES;
  }
  return GENRE_OPTIONS;
}

export const WRITER_LEVELS = [
  { value: "bloom", label: "Bloom" },
  { value: "forge", label: "Forge" },
  { value: "lethal", label: "Lethal" },
];

export const FEEDBACK_PREFERENCE_OPTIONS = [
  { value: "gentle", label: "Bloom" },
  { value: "balanced", label: "Forge" },
  { value: "direct", label: "Lethal" },
];

export const FEEDBACK_STRENGTH_OPTIONS = [
  "Big Picture",
  "Character",
  "Pacing",
  "Line-level",
  "Emotional Impact",
  "Plot Structure",
  "World Building",
  "Dialogue",
  "Voice & Tone",
  "Point of View",
  "Show vs. Tell",
  "Tension & Conflict",
  "Continuity",
  "Theme",
  "Opening & Closing",
  "Grammar & Mechanics",
];
