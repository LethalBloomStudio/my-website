const HARD_BLOCK_TERMS = [
  "graphic sexual assault",
  "sexual violence",
  "rape",
  "gore porn",
  "child sexual abuse",
];

const REVIEW_TRIGGER_TERMS = [
  "suicide",
  "self-harm",
  "extreme violence",
  "hate speech",
  "racial slur",
  "abuse",
];

function findHits(content: string, terms: string[]) {
  const lowered = content.toLowerCase();
  return terms.filter((term) => lowered.includes(term));
}

export function evaluateContentPolicy(content: string) {
  const blockedHits = findHits(content, HARD_BLOCK_TERMS);
  const reviewHits = findHits(content, REVIEW_TRIGGER_TERMS);

  return {
    blockedHits,
    reviewHits,
    shouldBlock: blockedHits.length > 0,
    shouldReview: reviewHits.length > 0 || blockedHits.length > 0,
  };
}

export function ageCategoryFromDob(dob: string | null | undefined) {
  if (!dob) return "adult_18_plus";
  const birth = new Date(`${dob}T00:00:00`);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const beforeBirthday =
    now.getMonth() < birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return age < 18 ? "youth_13_17" : "adult_18_plus";
}
