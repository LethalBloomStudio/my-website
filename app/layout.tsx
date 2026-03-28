// src/app/layout.tsx
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

export const metadata: Metadata = {
  metadataBase: new URL("https://lethalbloomstudio.com"),

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
    title: "Lethal Bloom Studio — Where Dark Stories Take Root",
    description:
      "Upload your manuscript. Collect honest feedback. Build your story in a community that takes writing seriously. Lethal Bloom Studio is the creative platform for writers who mean it.",
    images: [
      {
        url: "/brand/og-image.png",
        width: 1200,
        height: 630,
        alt: "Lethal Bloom Studio — Creative Writing Platform",
      },
    ],
  },

  twitter: {
    card: "summary_large_image",
    title: "Lethal Bloom Studio — Where Dark Stories Take Root",
    description:
      "Upload your manuscript. Collect honest feedback. Build your story in a community that takes writing seriously.",
    images: ["/brand/og-image.png"],
  },

  icons: {
    icon: "/brand/logo.svg",
    shortcut: "/brand/logo.svg",
    apple: "/brand/logo.svg",
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
        {/* Merriweather loaded with display=block so it never flashes a fallback font */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Merriweather:ital,wght@0,400;0,700;1,400&display=block" rel="stylesheet" />
      </head>
      <body>
        <ThemeProvider>
        <header className="navWrap">
          <div className="navInner">
            <div className="flex flex-none items-center gap-3.5">
              <Link href="/" aria-label="Home" className="brand">
                <Image src="/brand/logo.svg" alt="Logo" width={40} height={40} className="logo" />
              </Link>

              <nav className="tabs desktopNav">
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

        {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
