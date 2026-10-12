import Link from "next/link";
import { shop } from "@/data/content";
import styles from "./SiteFooter.module.css";

export function SiteFooter() {
  return (
    <footer id="contact" className={styles.footer}>
      <p className={styles.name}>{shop.name}</p>
      <div className={styles.grid}>
        <p>
          {shop.city}, {shop.country}
          <br />
          {shop.address}
        </p>
        <p>{shop.hours}</p>
        <p>
          <a href={shop.instagram}>Instagram</a>
          <br />
          <a href={shop.telegram}>Telegram</a>
          <br />
          <a href={shop.phoneHref}>{shop.phone}</a>
        </p>
        <p>
          <Link className="cta" href="/book">
            Book a visit
          </Link>
        </p>
      </div>
    </footer>
  );
}
