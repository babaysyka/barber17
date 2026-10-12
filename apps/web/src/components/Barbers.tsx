"use client";

import Image from "next/image";
import { useEffect, useRef } from "react";
import { useLenis } from "lenis/react";
import { gsap, useGSAP } from "@/lib/gsap";
import { CatalogNote } from "@/components/CatalogNote";
import type { BarberView } from "@/lib/catalog";
import styles from "./Barbers.module.css";

export function Barbers({ barbers }: { barbers: BarberView[] | null }) {
  const root = useRef<HTMLElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const lenis = useLenis();
  const lenisRef = useRef(lenis);

  useEffect(() => {
    lenisRef.current = lenis;
  }, [lenis]);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(min-width: 768px) and (prefers-reduced-motion: no-preference)", () => {
        const el = track.current;
        if (!el) return;
        const distance = () => el.scrollWidth - window.innerWidth;

        const scrollTween = gsap.to(el, {
          x: () => -distance(),
          ease: "none",
          scrollTrigger: {
            trigger: root.current,
            start: "top top",
            end: () => "+=" + distance(),
            pin: true,
            pinType: "transform",
            pinSpacing: true,
            scrub: true,
            invalidateOnRefresh: true,
            anticipatePin: 1,
          },
        });

        gsap.utils.toArray<HTMLElement>("[data-card]", el).forEach((card) => {
          const photo = card.querySelector("[data-photo]");
          if (!photo) return;
          gsap.fromTo(
            photo,
            { xPercent: -6 },
            {
              xPercent: 6,
              ease: "none",
              scrollTrigger: {
                trigger: card,
                containerAnimation: scrollTween,
                start: "left right",
                end: "right left",
                scrub: true,
              },
            },
          );
        });

        const st = scrollTween.scrollTrigger;
        if (!st) return;
        const onFocus = (event: FocusEvent) => {
          const card = (event.target as HTMLElement).closest<HTMLElement>("[data-card]");
          if (!card) return;
          const ratio = gsap.utils.clamp(0, 1, (card.offsetLeft - window.innerWidth * 0.12) / distance());
          const y = st.start + ratio * (st.end - st.start);
          if (lenisRef.current) lenisRef.current.scrollTo(y, { immediate: true });
          else window.scrollTo(0, y);
        };
        el.addEventListener("focusin", onFocus);
        return () => el.removeEventListener("focusin", onFocus);
      });
    },
    { scope: root },
  );

  return (
    <div>
      <section ref={root} id="barbers" className={styles.section} aria-labelledby="barbers-title">
        <h2 id="barbers-title" className={styles.title}>
          The hands
          <em>behind the craft</em>
        </h2>
        <div ref={track} className={styles.track}>
          {barbers === null ? <CatalogNote>The barber list did not load.</CatalogNote> : null}
          {barbers !== null && barbers.length === 0 ? <CatalogNote>No barbers are in the chair.</CatalogNote> : null}
          {barbers?.map((barber) => (
            <article key={barber.id} data-card className={styles.card}>
              <div className={styles.photo}>
                <div data-photo className={styles.shift}>
                  <Image src={barber.image} alt="" fill sizes="(max-width: 767px) 80vw, 36vw" />
                </div>
                <div className={styles.caption}>
                  <h3>{barber.name}</h3>
                  <p>
                    {barber.focus}
                    <br />
                    {barber.years}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
