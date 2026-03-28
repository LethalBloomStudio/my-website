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
  title: "Your Site",
  description: "Your description",
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
