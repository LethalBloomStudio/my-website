"use client";

import { useEffect } from "react";

export default function NavScrollBehavior() {
  useEffect(() => {
    let lastScrollY = window.scrollY;
    let navHidden = false;

    const nav = document.querySelector(".navWrap") as HTMLElement | null;
    if (!nav) return;

    const showNav = () => {
      nav.style.transform = "translateY(0)";
      navHidden = false;
    };

    const hideNav = () => {
      nav.style.transform = "translateY(-100%)";
      navHidden = true;
    };

    const handleScroll = () => {
      const currentY = window.scrollY;
      if (currentY < 60) {
        showNav();
      } else if (currentY > lastScrollY + 4) {
        hideNav();
      } else if (currentY < lastScrollY - 4) {
        showNav();
      }
      lastScrollY = currentY;
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (e.clientY < 8 && navHidden) {
        showNav();
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("mousemove", handleMouseMove);

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, []);

  return null;
}
