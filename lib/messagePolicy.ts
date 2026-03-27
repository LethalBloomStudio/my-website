export type TriggerCode =
  | "poaching"
  | "offsite_contact"
  | "social_media"
  | "fiverr"
  | "phone_contact"
  | "offplatform_redirect"
  | "external_link"
  | "solicitation"
  | "secrecy"
  | "cursing"
  | "foul_language"
  | "sexual_language";

const BASE_TRIGGERS: Array<{ code: TriggerCode; terms: string[] }> = [
  {
    code: "poaching",
    terms: [
      "leave this site",
      "poach",
      "come to my site",
      "better platform",
      "i know a better place",
      "take you somewhere else",
      "work outside this site",
      "collaborate outside",
    ],
  },
  {
    code: "offsite_contact",
    terms: [
      // email variants
      "email",
      "e-mail",
      "mail me",
      "send me your email",
      "what's your email",
      "whats your email",
      "my email",
      "email me",
      "contact me at",
      "gmail",
      "yahoo",
      "outlook",
      "protonmail",
      "aol",
      "icloud",
      "g m a i l",
      "g-mail",
      "g_mail",
      "y a h o o",
      "out look",
      "proton mail",
      "mail dot com",
      "at gmail dot com",
      "at yahoo dot com",
      "dot com",
      "dot net",
      "dot org",
      // legacy
      "email me at",
      "@gmail.com",
      "@yahoo.com",
      "@outlook.com",
    ],
  },
  {
    code: "external_link",
    terms: [
      "google doc",
      "google docs",
      "drive link",
      "google drive",
      "dropbox",
      "pastebin",
      "send link",
      "link here",
      "shared doc",
      "shared document",
      "pdf link",
      "external link",
      "upload link",
      "file share",
    ],
  },
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
  {
    code: "secrecy",
    terms: [
      "don't tell mods",
      "dont tell mods",
      "keep this between us",
      "just us",
      "secret",
      "trust me",
      "no one has to know",
      "won't report you",
      "wont report you",
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
  if (consequence === "warning_1") return "Warning issued. Keep conversation on-platform and policy-safe.";
  if (consequence === "warning_2") return "Second warning issued. Another violation will trigger suspension.";
  if (consequence === "suspended_3_days")
    return "Chat/feedback privileges suspended for 3 days due to repeated violations.";
  return "Account blacklisted from messaging. You may request an appeal for owner review.";
}
