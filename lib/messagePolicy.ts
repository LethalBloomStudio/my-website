export type TriggerCode =
  | "solicitation"
  | "social_media"
  | "cursing"
  | "foul_language"
  | "sexual_language"
  | "poaching"
  | "offsite_contact"
  | "external_link"
  | "secrecy";

// BASE_TRIGGERS apply to everyone — solicitation is the sole universal check
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

// YOUTH_CONTACT_TRIGGERS apply whenever either party to the interaction is a
// youth account (sender OR recipient) - restored from the pre-c195968 policy,
// byte-accurate to the original term lists, scoped narrower than before
// (previously universal, now youth-involved only).
const YOUTH_CONTACT_TRIGGERS: Array<{ code: TriggerCode; terms: string[] }> = [
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

export function evaluateMessageTriggers(
  message: string,
  senderAgeCategory: string | null,
  recipientAgeCategory: string | null = null
) {
  const input = message.toLowerCase();
  const senderIsYouth = senderAgeCategory === "youth_13_17";
  const involvesYouth = senderIsYouth || recipientAgeCategory === "youth_13_17";

  const rules = [
    ...BASE_TRIGGERS,
    // Unchanged from before: gated on the sender's own age only, independent
    // of involvesYouth below.
    ...(senderIsYouth ? YOUTH_EXTRA_TRIGGERS : []),
    // Restored contact-evasion triggers: fire when either party is youth.
    ...(involvesYouth ? YOUTH_CONTACT_TRIGGERS : []),
  ];

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
