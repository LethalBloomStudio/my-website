import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/admin/",
        "/account/",
        "/settings/",
        "/messages/",
        "/notifications/",
        "/wallet/",
        "/manage-youth/",
        "/moderation/",
        "/supabase-test/",
        "/auth/",
        "/check-email/",
        "/reset-password/",
        "/parent-consent/",
        "/youth-invite/",
      ],
    },
    sitemap: "https://lethalbloomstudio.com/sitemap.xml",
  };
}
