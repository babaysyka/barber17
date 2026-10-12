"use client";

import Image from "next/image";
import { useRef } from "react";
import { EASE, gsap, useGSAP } from "@/lib/gsap";
import styles from "./Space.module.css";

export function Space() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.from("[data-clip]", {
          clipPath: "inset(14% 0% 14% 0%)",
          duration: 1.2,
          ease: EASE.out,
          scrollTrigger: { trigger: "[data-clip]", start: "top 80%", once: true },
        });
      });

      mm.add("(min-width: 768px) and (prefers-reduced-motion: no-preference)", () => {
        const photo = root.current?.querySelector("[data-speed]");
        const trigger = root.current?.querySelector("[data-speed-trigger]");
        if (!photo || !trigger) return;
        const travel = () => (1 - 0.96) * (window.innerHeight + (trigger as HTMLElement).offsetHeight);
        gsap.fromTo(
          photo,
          { y: () => -travel() / 2 },
          {
            y: () => travel() / 2,
            ease: "none",
            scrollTrigger: {
              trigger,
              start: "top bottom",
              end: "bottom top",
              scrub: true,
              invalidateOnRefresh: true,
            },
          },
        );
      });
    },
    { scope: root },
  );

  return (
    <section ref={root} id="space" className={styles.section} aria-labelledby="space-title">
      <p className={styles.label}>The house</p>
      <h2 id="space-title" className={styles.title}>
        Stone, timber, warm light.
      </h2>
      <div className={styles.asym}>
        <figure data-clip className={styles.big}>
          <Image src="/images/space-1.jpg" alt="The main room: stone, a black chair, a brass lamp" fill sizes="70vw" />
        </figure>
        <div className={styles.stack}>
          <figure>
            <Image src="/images/space-2.jpg" alt="Travertine meeting a brass edge" fill sizes="30vw" />
          </figure>
          <figure>
            <Image src="/images/space-3.jpg" alt="Linen folded on a stone shelf" fill sizes="30vw" />
          </figure>
        </div>
      </div>
      <p className={styles.copy}>
        One room. Chairs set far enough apart that a conversation stays private. Nothing on the walls is there to impress you.
      </p>
      <figure className={styles.full} data-speed-trigger>
        <div data-speed className={styles.bleed}>
          <Image src="/images/space-4.jpg" alt="The room seen from the doorway" fill sizes="100vw" />
        </div>
      </figure>
    </section>
  );
}
