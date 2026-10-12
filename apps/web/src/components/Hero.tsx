"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef } from "react";
import { Magnetic } from "@/components/fx/Magnetic";
import { EASE, SplitText, gsap, useGSAP } from "@/lib/gsap";
import styles from "./Hero.module.css";

export function Hero() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const title = root.current?.querySelector<HTMLElement>("[data-hero-title]");
        if (!title) return;

        SplitText.create(title, {
          type: "lines",
          mask: "lines",
          linesClass: "line",
          autoSplit: true,
          aria: "auto",
          onSplit(self) {
            return gsap
              .timeline({ defaults: { ease: EASE.out } })
              .fromTo(
                "[data-hero-media]",
                { scale: 1.08 },
                { scale: 1, duration: 1.6, ease: "power3.out" },
                0,
              )
              .from(self.lines, { yPercent: 110, duration: 1.15, stagger: 0.1 }, 0.28)
              .from("[data-hero-kicker]", { y: 16, autoAlpha: 0, duration: 0.8 }, 0.7)
              .from("[data-hero-lead]", { y: 16, autoAlpha: 0, duration: 0.8 }, 0.9)
              .from("[data-hero-cta]", { y: 18, autoAlpha: 0, duration: 0.85 }, 1.1);
          },
        });
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} className={styles.hero} aria-labelledby="hero-title">
      <div className={styles.frame}>
        <div data-hero-media className={styles.media}>
          <Image
            src="/images/hero.jpg"
            alt=""
            fill
            priority
            sizes="100vw"
          />
        </div>
      </div>
      <div className={styles.scrim} />
      <div className={styles.copy}>
        <p className={styles.kicker} data-hero-kicker>
          Tashkent · Men&apos;s grooming
        </p>
        <h1 id="hero-title" className={styles.title} data-hero-title>
          Your style.
          <em>Your standard.</em>
        </h1>
        <p className={styles.lead} data-hero-lead>
          Premium men&apos;s grooming in the heart of Tashkent.
        </p>
        <div className={styles.actions} data-hero-cta>
          <Magnetic>
            <Link className="cta" href="/book">
              Book a visit
            </Link>
          </Magnetic>
          <a className="textLink" href="#space">
            Explore the space
          </a>
        </div>
      </div>
    </section>
  );
}
