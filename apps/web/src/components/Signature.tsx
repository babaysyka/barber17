"use client";

import Image from "next/image";
import { useRef } from "react";
import { gsap, useGSAP } from "@/lib/gsap";
import styles from "./Signature.module.css";

const words = ["Precision", "Craft", "Character"];

export function Signature() {
  const root = useRef<HTMLElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(min-width: 768px) and (prefers-reduced-motion: no-preference)", () => {
        gsap
          .timeline({
            defaults: { ease: "none" },
            scrollTrigger: {
              trigger: root.current,
              start: "top top",
              end: "+=140%",
              pin: true,
              pinType: "transform",
              pinSpacing: true,
              scrub: true,
              anticipatePin: 1,
              invalidateOnRefresh: true,
            },
          })
          .fromTo(
            "[data-sig-frame]",
            { clipPath: "inset(16% 12% 16% 12%)" },
            { clipPath: "inset(0% 0% 0% 0%)", duration: 1 },
            0,
          )
          .fromTo("[data-sig-media]", { scale: 1.16 }, { scale: 1, duration: 1 }, 0)
          .fromTo("[data-sig-word='0']", { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.16 }, 0.22)
          .fromTo("[data-sig-word='1']", { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.16 }, 0.48)
          .fromTo("[data-sig-word='2']", { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.16 }, 0.74);
      });
    },
    { scope: root },
  );

  return (
    <div className={styles.host}>
      <section ref={root} className={styles.section} aria-labelledby="signature-title">
        <h2 id="signature-title" className="sr-only">
          Precision, craft, character
        </h2>
        <div data-sig-frame className={styles.frame}>
          <div data-sig-media className={styles.media}>
            <Image src="/images/sig.jpg" alt="" fill sizes="100vw" />
          </div>
          <div className={styles.words} aria-hidden="true">
            {words.map((word, index) => (
              <p key={word} data-sig-word={index} className={styles.word}>
                {word}
              </p>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
