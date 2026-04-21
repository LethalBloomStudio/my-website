"use client";

import { useEffect } from "react";

export default function NavScrollBehavior() {
  useEffect(() => {
    let lastScrollY = window.scrollY;
    let navHidden = false;

    const nav = document.querySelector(".navWrap") as HTMLElement | null;
    const tab = document.getElementById("nav-pull-tab") as HTMLElement | null;
    if (!nav) return;

    const showNav = () => {
      nav.style.transform = "translateY(0)";
      if (tab) tab.style.transform = "translateX(-50%) translateY(-100%)";
      navHidden = false;
    };

    const hideNav = () => {
      nav.style.transform = "translateY(-100%)";
      if (tab) tab.style.transform = "translateX(-50%) translateY(0)";
      navHidden = true;
    };

    const handleScroll = () => {
      const currentY = window.scrollY;
      if (currentY < 60) {
        showNav();
      } else if (currentY > lastScrollY + 4) {
        hideNav();
      }
      lastScrollY = currentY;
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (e.clientY < 8 && navHidden) {
        showNav();
      }
    };

    if (tab) {
      tab.addEventListener("click", showNav);
      tab.addEventListener("mouseenter", showNav);
    }

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("mousemove", handleMouseMove);

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("mousemove", handleMouseMove);
      if (tab) {
        tab.removeEventListener("click", showNav);
        tab.removeEventListener("mouseenter", showNav);
      }
    };
  }, []);

  return null;
}
