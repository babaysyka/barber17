"use client";

import Image from "next/image";
import { useRef } from "react";
import { gsap, useGSAP } from "@/lib/gsap";
import styles from "./Tashkent.module.css";

export function Tashkent() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
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
    <section ref={root} className={styles.section} aria-labelledby="tashkent-title">
      <h2 id="tashkent-title" className={styles.title}>
        Built in Tashkent.
        <em>Made for men who move.</em>
      </h2>
      <figure className={styles.wide} data-speed-trigger>
        <div data-speed className={styles.bleed}>
          <Image
            src="/images/city-1.jpg"
            alt="Evening towers and a wide stone avenue"
            fill
            sizes="100vw"
          />
        </div>
      </figure>
      <div className={styles.pair}>
        <figure>
          <Image src="/images/city-2.jpg" alt="Warm light on a limestone street" fill sizes="50vw" />
        </figure>
        <figure>
          <Image src="/images/city-3.jpg" alt="A quiet stone and glass lobby at night" fill sizes="50vw" />
        </figure>
      </div>
      <p className={styles.copy}>
        Orda is a house on Shota Rustaveli. Around it the city is stone, glass, and the slow traffic of evening.
        We cut for men who keep that pace, and who want one hour that belongs only to them.
      </p>
    </section>
  );
}
