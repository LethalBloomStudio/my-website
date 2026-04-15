// src/app/layout.tsx
/* eslint-disable @next/next/google-font-display, @next/next/no-page-custom-font */
import type { Metadata, Viewport } from "next";
import "./globals.css";
import Link from "next/link";
import Image from "next/image";
import HomeNavButton from "@/components/HomeNavButton";
import AuthButton from "@/components/AuthButton";
import AuthGatedNav from "@/components/AuthGatedNav";
import MessagesNavButton from "@/components/MessagesNavButton";
import ThemeProvider from "@/components/ThemeProvider";
import ThemeToggle from "@/components/ThemeToggle";
import MobileNav from "@/components/MobileNav";
import ActivityPing from "@/components/ActivityPing";
import Footer from "@/components/Footer";
import NavScrollBehavior from "@/components/NavScrollBehavior";
import PromotionBanner from "@/components/PromotionBanner";
import Script from "next/script";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://lethalbloomstudio.com"),

  title: {
    default: "Lethal Bloom Studio",
    template: "%s | Lethal Bloom Studio",
  },

  description:
    "Lethal Bloom Studio is a creative writing platform for authors, beta readers, and storytellers. Upload manuscripts, collect line-level feedback, and grow your craft inside a community built for serious writers.",

  keywords: [
    "creative writing",
    "manuscript feedback",
    "beta readers",
    "fiction writing",
    "writing community",
    "storytelling platform",
    "author tools",
    "Lethal Bloom Studio",
  ],

  authors: [{ name: "Lethal Bloom Studio" }],
  creator: "Lethal Bloom Studio",
  publisher: "Lethal Bloom Studio",

  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },

  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://lethalbloomstudio.com",
    siteName: "Lethal Bloom Studio",
    title: "Lethal Bloom Studio - Where Writers Sharpen Their Craft Together",
    description:
      "Upload your manuscript. Collect honest feedback. Build your story in a community that takes writing seriously. Lethal Bloom Studio is the creative platform for writers who mean it.",
    images: [
      {
        url: "/Website Logo.png",
        width: 1200,
        height: 630,
        alt: "Lethal Bloom Studio - Creative Writing Platform",
      },
    ],
  },

  twitter: {
    card: "summary_large_image",
    title: "Lethal Bloom Studio - Where Writers Sharpen Their Craft Together",
    description:
      "Upload your manuscript. Collect honest feedback. Build your story in a community that takes writing seriously.",
    images: ["/Website Logo.png"],
  },

  icons: {
    icon: "/brand/logo.svg",
    shortcut: "/brand/logo.svg",
    apple: "/brand/logo.svg",
  },

  verification: {
    google: "wZNOEZmRBm0uf-lQ3X79cewcsWFpRlKobWbCzdvHI5I",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

const tabs = [
  { href: "/pricing", label: "Pricing" },
  { href: "/help", label: "Help" },
];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      {/* Runs before React hydrates to prevent flash of wrong theme */}
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('theme');if(t==='day')document.documentElement.setAttribute('data-theme','day');}catch(e){}})();` }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Merriweather:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet" />
        <meta name="theme-color" content="#0d0d0f" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="apple-touch-icon" href="/brand/icon-192.png" />
      </head>
      <body>
        {/* Skip navigation - visible on focus for keyboard/screen reader users */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[9999] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-black focus:shadow-lg focus:outline-none"
        >
          Skip to main content
        </a>
        <Script
          id="lbs-service-worker"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
                const isLocalhost = Boolean(
                  window.location.hostname === 'localhost' ||
                  window.location.hostname === '127.0.0.1'
                );
                const shouldRegister = window.location.protocol === 'https:' || isLocalhost;
                if (shouldRegister) {
                  navigator.serviceWorker.register('/service-worker.js').catch(() => {});
                }
              }
            `,
          }}
        />
        <ActivityPing />
        <NavScrollBehavior />
        {/* Pull-tab shown when nav is hidden */}
        <div
          id="nav-pull-tab"
          aria-hidden="true"
          style={{
            position: "fixed",
            top: 0,
            left: "50%",
            transform: "translateX(-50%) translateY(-100%)",
            zIndex: 51,
            transition: "transform 0.3s ease",
            cursor: "pointer",
          }}
        >
          <div style={{
            background: "rgba(100,100,100,0.55)",
            backdropFilter: "blur(6px)",
            borderRadius: "0 0 12px 12px",
            padding: "5px 18px 6px",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </div>
        <ThemeProvider>
        <header className="navWrap">
          <div className="navInner">
            <div className="flex flex-none items-center gap-3.5">
              <Link href="/" aria-label="Home" className="brand">
                <Image
                  src="/brand/logo.svg"
                  alt="Lethal Bloom Studio"
                  width={40}
                  height={40}
                  className="logo"
                  loading="eager"
                />
              </Link>

              <nav className="tabs desktopNav" aria-label="Main navigation">
                <HomeNavButton />
                {tabs.map((t) => (
                  <Link key={t.href} href={t.href} className="tab">
                    {t.label}
                  </Link>
                ))}
              </nav>
            </div>

            <div className="navRight">
              <div className="desktopNav" style={{ display: "contents" }}>
                <AuthGatedNav />
                <MessagesNavButton />
              </div>
              <ThemeToggle />
              <AuthButton />
              <MobileNav />
            </div>
          </div>
        </header>

        <PromotionBanner />
        <div id="main-content">
          {children}
        </div>
        <Footer />
        </ThemeProvider>
      </body>
    </html>
  );
}
