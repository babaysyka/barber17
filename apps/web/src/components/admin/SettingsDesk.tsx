"use client";

import { FormEvent, useEffect, useState } from "react";
import { AdminError, adminFetch } from "@/lib/admin-api";
import styles from "./admin.module.css";

const labels: Record<string, string> = {
  slot_step_min: "Slot step, minutes",
  min_notice_min: "Minimum notice, minutes",
  booking_horizon_days: "How many days ahead",
  cancel_cutoff_min: "Cancel cutoff, minutes",
  timezone: "Timezone",
  reminder_day_minutes: "Day-before reminder, minutes",
  reminder_short_minutes: "Short reminder, minutes",
  review_delay_min: "Review delay, minutes",
  review_public_min_rating: "Public from rating",
  shop_name: "Shop name",
  shop_address: "Address",
  shop_phone: "Phone",
};

export function SettingsDesk() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    adminFetch<Record<string, string>>("/api/v1/admin/settings")
      .then((rows) => {
        setValues(rows);
        setReady(true);
      })
      .catch((caught) => setError(caught instanceof AdminError ? caught.message : "Could not load settings"));
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = Object.fromEntries(Array.from(new FormData(event.currentTarget).entries(), ([key, value]) => [key, String(value)]));
    setError("");
    setSaved(false);
    try {
      await adminFetch("/api/v1/admin/settings", { method: "PUT", body: JSON.stringify(next) });
      setSaved(true);
    } catch (caught) {
      setError(caught instanceof AdminError ? caught.message : "Could not save settings");
    }
  }

  const keys = Object.keys(values).filter((key) => !key.startsWith("barber_link:"));
  if (!ready) return error ? <p className={styles.error}>{error}</p> : null;
  return (
    <section className={styles.page}>
      <h1>Settings</h1>
      <p className={styles.lead}>These values drive slots, reminders, and the public shop line.</p>
      {error ? <p className={styles.error}>{error}</p> : null}
      <form className={styles.stack} onSubmit={save}>
        {keys.map((key) => (
          <label key={key}>
            {labels[key] ?? key}
            <input name={key} defaultValue={values[key]} />
          </label>
        ))}
        <button className={styles.button} type="submit">
          Save
        </button>
        {saved ? <p className={styles.meta}>Saved.</p> : null}
      </form>
    </section>
  );
}
