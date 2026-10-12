"use client";

import { useEffect, useState } from "react";
import { AdminError, adminFetch } from "@/lib/admin-api";
import styles from "./admin.module.css";

type Review = { id: string; rating: number; comment: string | null; isPublic: boolean; clientName: string; barberName: string };

export function ReviewsDesk() {
  const [rows, setRows] = useState<Review[]>([]);
  const [error, setError] = useState("");

  function load() {
    adminFetch<Review[]>("/api/v1/admin/reviews")
      .then(setRows)
      .catch((caught) => setError(caught instanceof AdminError ? caught.message : "Could not load reviews"));
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <section className={styles.page}>
      <h1>Reviews</h1>
      <p className={styles.lead}>Public reviews can appear on the site. Ratings of 4 and 5 start public.</p>
      {error ? <p className={styles.error}>{error}</p> : null}
      <div className={styles.list}>
        {rows.map((row) => (
          <article className={styles.card} key={row.id}>
            <p>
              {row.rating}/5 · {row.clientName} · {row.barberName}
            </p>
            <p className={styles.meta}>{row.comment || "No comment"}</p>
            <label>
              <input
                type="checkbox"
                checked={row.isPublic}
                onChange={(event) => {
                  void adminFetch(`/api/v1/admin/reviews/${row.id}`, {
                    method: "PATCH",
                    body: JSON.stringify({ isPublic: event.target.checked }),
                  }).then(load);
                }}
              />{" "}
              Public
            </label>
          </article>
        ))}
        {rows.length === 0 ? <p className={styles.meta}>No reviews yet.</p> : null}
      </div>
    </section>
  );
}
