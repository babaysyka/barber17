import Image from "next/image";
import styles from "./Proof.module.css";

export function Proof() {
  return (
    <section className={styles.section} aria-labelledby="proof-title">
      <h2 id="proof-title" className="sr-only">
        A note from Tashkent
      </h2>
      <figure className={styles.quote}>
        <blockquote>
          <p>I book the last chair on Thursday. Forty minutes, and the week stops sounding loud.</p>
        </blockquote>
        <figcaption>
          Timur Rakhimov
          <br />
          Tashkent
        </figcaption>
      </figure>
      <div className={styles.shots}>
        <figure>
          <Image src="/images/space-3.jpg" alt="" fill sizes="40vw" />
        </figure>
        <figure>
          <Image src="/images/city-2.jpg" alt="" fill sizes="40vw" />
        </figure>
      </div>
    </section>
  );
}
