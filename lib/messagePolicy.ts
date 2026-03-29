export type TriggerCode =
  | "solicitation"
  | "social_media"
  | "cursing"
  | "foul_language"
  | "sexual_language";

// BASE_TRIGGERS apply to adult profiles only — solicitation is the sole check
const BASE_TRIGGERS: Array<{ code: TriggerCode; terms: string[] }> = [
  {
    code: "solicitation",
    terms: [
      "come work with me",
      "work with me",
      "i have a project for you",
      "paid opportunity",
      "paying gig",
      "hire you",
      "join my team",
      "fiverr",
      "upwork",
      "freelancer.com",
    ],
  },
];

const YOUTH_EXTRA_TRIGGERS: Array<{ code: TriggerCode; terms: string[] }> = [
  { code: "cursing", terms: ["fuck", "shit", "bitch", "asshole"] },
  { code: "foul_language", terms: ["motherfucker", "slut", "whore"] },
  { code: "sexual_language", terms: ["sexual", "nude", "horny", "explicit sex"] },
  {
    code: "social_media",
    terms: [
      "instagram",
      "insta",
      "facebook",
      "tiktok",
      "tik tok",
      "snapchat",
      "snap",
      "twitter",
      "x.com",
      "discord",
      "discord.gg",
      "whatsapp",
      "telegram",
      "t.me",
      "kik",
      "wechat",
      "reddit",
      "tumblr",
      "linkedin",
      "pinterest",
      "twitch",
      "youtube.com",
      "youtu.be",
    ],
  },
];

export function evaluateMessageTriggers(message: string, senderAgeCategory: string | null) {
  const input = message.toLowerCase();
  const rules =
    senderAgeCategory === "youth_13_17"
      ? [...BASE_TRIGGERS, ...YOUTH_EXTRA_TRIGGERS]
      : BASE_TRIGGERS;

  const matched = rules
    .filter((r) => r.terms.some((term) => input.includes(term)))
    .map((r) => r.code);

  return Array.from(new Set(matched));
}

export function consequenceFromStrike(strike: number) {
  if (strike <= 1) return "warning_1";
  if (strike === 2) return "warning_2";
  if (strike === 3) return "suspended_3_days";
  return "blacklisted";
}

export function consequenceMessage(consequence: string) {
  if (consequence === "warning_1")
    return "Heads up! We're a community of writers who respect each other. Please avoid soliciting other members for paid work or external opportunities.";
  if (consequence === "warning_2")
    return "This is your second reminder. We ask that all members keep interactions respectful and free of solicitation. One more violation will result in a temporary messaging suspension.";
  if (consequence === "suspended_3_days")
    return "Your messaging has been temporarily suspended for 3 days. We want this to be a safe and welcoming space for all writers — repeated policy violations won't be tolerated.";
  return "Your messaging access has been removed after repeated violations. This is a community built on trust and respect. You may submit an appeal for owner review.";
}
