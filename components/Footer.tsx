import Link from "next/link";
import Image from "next/image";

const footerLinks = [
  {
    heading: "Support",
    links: [
      { href: "/help", label: "Help & FAQ" },
      { href: "/accessibility", label: "Accessibility" },
      { href: "mailto:support@lethalbloomstudio.com", label: "Contact Us" },
    ],
  },
  {
    heading: "Legal",
    links: [
      { href: "/about", label: "About" },
      { href: "/privacy", label: "Privacy Policy" },
      { href: "/terms", label: "Terms of Service" },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="siteFooter" aria-label="Site footer">
      <div className="footerInner">
        <div className="footerBrand">
          <Link href="/" aria-label="Home" className="footerLogo">
            <Image
              src="/brand/logo.svg"
              alt="Lethal Bloom Studio"
              width={32}
              height={32}
            />
            <span className="footerBrandName">Lethal Bloom Studio</span>
          </Link>
          <p className="footerTagline">A home for writers who mean every word.</p>
        </div>

        <nav className="footerNav" aria-label="Footer navigation">
          {footerLinks.map((col) => (
            <div key={col.heading} className="footerCol">
              <p className="footerColHeading">{col.heading}</p>
              <ul className="footerColLinks">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="footerLink">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>

      <div className="footerBottom">
        <p className="footerCopy">
          &copy; {new Date().getFullYear()} Lethal Bloom Studio. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
