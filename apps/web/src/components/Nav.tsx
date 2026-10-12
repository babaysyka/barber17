"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLenis } from "lenis/react";
import { nav, shop } from "@/data/content";
import { ScrollTrigger, useGSAP } from "@/lib/gsap";
import styles from "./Nav.module.css";

export function Nav({ solid = false }: { solid?: boolean }) {
  const headerRef = useRef<HTMLElement>(null);
  const [open, setOpen] = useState(false);
  const lenis = useLenis();
  const pathname = usePathname();
  const home = pathname === "/";

  useGSAP(
    () => {
      if (solid) return;
      ScrollTrigger.create({
        trigger: document.documentElement,
        start: "top -40px",
        end: "bottom top",
        onToggle: (self) => {
          headerRef.current?.classList.toggle(styles.compact, self.isActive);
        },
      });
    },
    { scope: headerRef, dependencies: [solid] },
  );

  useEffect(() => {
    if (!lenis) return;
    if (open) {
      lenis.stop();
      return () => lenis.start();
    }
    return undefined;
  }, [open, lenis]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function close() {
    setOpen(false);
  }

  return (
    <header
      ref={headerRef}
      className={solid ? `${styles.header} ${styles.compact}` : styles.header}
      data-open={open ? "true" : "false"}
    >
      {home ? (
        <a className={styles.logo} href="#main">
          {shop.name}
        </a>
      ) : (
        <Link className={styles.logo} href="/">
          {shop.name}
        </Link>
      )}
      <nav className={styles.desktop} aria-label="Primary">
        {nav.map((item) =>
          home ? (
            <a key={item.href} href={item.href}>
              {item.label}
            </a>
          ) : (
            <Link key={item.href} href={`/${item.href}`}>
              {item.label}
            </Link>
          ),
        )}
        <Link className="cta" href="/book">
          Book now
        </Link>
      </nav>
      <button
        className={styles.menuButton}
        type="button"
        aria-expanded={open}
        aria-controls="mobile-nav"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? "Close" : "Menu"}
      </button>
      {open ? (
        <div id="mobile-nav" className={styles.overlay}>
          <nav aria-label="Primary">
            {nav.map((item) =>
              home ? (
                <a key={item.href} href={item.href} onClick={close}>
                  {item.label}
                </a>
              ) : (
                <Link key={item.href} href={`/${item.href}`} onClick={close}>
                  {item.label}
                </Link>
              ),
            )}
            <Link href="/book" onClick={close}>
              Book now
            </Link>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
