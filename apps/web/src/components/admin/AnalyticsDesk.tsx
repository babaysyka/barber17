"use client";

import { FormEvent, useEffect, useState } from "react";
import { AdminError, adminFetch } from "@/lib/admin-api";
import styles from "./admin.module.css";

type Report = {
  revenue: number;
  bookings: { total: number; completed: number; confirmed: number; cancelled: number; noShow: number };
  cancellations: { count: number; rate: number };
  noShows: { count: number; rate: number };
  services: { serviceId: string; name: string; count: number; revenue: number }[];
  barbers: { barberId: string; name: string; occupiedMin: number; availableMin: number; load: number }[];
  retention: { clients: number; returning: number; rate: number };
  heatmap: number[][];
};

const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const hours = Array.from({ length: 14 }, (_, index) => index + 8);

function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tashkent" }).format(new Date());
}

function shift(daysBack: number) {
  const [year, month, day] = today().split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + daysBack)).toISOString().slice(0, 10);
}

function money(value: number) {
  return `${new Intl.NumberFormat("en-US").format(value)} soʻm`;
}

function share(rate: number) {
  return `${Math.round(rate * 1000) / 10}%`;
}

export function AnalyticsDesk() {
  const [from, setFrom] = useState(shift(-29));
  const [to, setTo] = useState(today);
  const [range, setRange] = useState({ from: shift(-29), to: today() });
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    adminFetch<Report>(`/api/v1/admin/analytics?from=${range.from}&to=${range.to}`)
      .then((next) => {
        setReport(next);
        setError("");
      })
      .catch((caught) => setError(caught instanceof AdminError ? caught.message : "Could not load the numbers"));
  }, [range]);

  function apply(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRange({ from, to });
  }

  const peak = report ? Math.max(1, ...report.heatmap.flat()) : 1;

  return (
    <section className={styles.page}>
      <h1>Numbers</h1>
      <p className={styles.lead}>Revenue counts completed visits. Load is booked minutes against the open chair. Times are Tashkent.</p>
      <form className={`${styles.card} ${styles.row}`} onSubmit={apply}>
        <label>
          From
          <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} required />
        </label>
        <label>
          To
          <input type="date" value={to} onChange={(event) => setTo(event.target.value)} required />
        </label>
        <div className={styles.actions}>
          <button className={styles.button} type="submit">
            Show
          </button>
          <button className={styles.quiet} type="button" onClick={() => { const next = { from: shift(-6), to: today() }; setFrom(next.from); setTo(next.to); setRange(next); }}>
            7 days
          </button>
          <button className={styles.quiet} type="button" onClick={() => { const next = { from: shift(-29), to: today() }; setFrom(next.from); setTo(next.to); setRange(next); }}>
            30 days
          </button>
        </div>
      </form>
      {error ? <p className={styles.error}>{error}</p> : null}
      {report ? (
        <>
          <div className={styles.stats}>
            <article className={`${styles.card} ${styles.stat}`}>
              Revenue
              <strong>{money(report.revenue)}</strong>
            </article>
            <article className={`${styles.card} ${styles.stat}`}>
              Bookings
              <strong>{report.bookings.total}</strong>
              <p className={styles.meta}>{report.bookings.completed} completed · {report.bookings.confirmed} ahead</p>
            </article>
            <article className={`${styles.card} ${styles.stat}`}>
              Cancellations
              <strong>{report.cancellations.count}</strong>
              <p className={styles.meta}>{share(report.cancellations.rate)} of bookings</p>
            </article>
            <article className={`${styles.card} ${styles.stat}`}>
              No-shows
              <strong>{report.noShows.count}</strong>
              <p className={styles.meta}>{share(report.noShows.rate)} of bookings</p>
            </article>
            <article className={`${styles.card} ${styles.stat}`}>
              Returning
              <strong>{share(report.retention.rate)}</strong>
              <p className={styles.meta}>{report.retention.returning} of {report.retention.clients} clients came before</p>
            </article>
          </div>
          <div className={styles.card}>
            <h2>Services</h2>
            <div className={styles.list}>
              {report.services.map((service) => (
                <p key={service.serviceId}>
                  {service.name} · {service.count} · {money(service.revenue)}
                </p>
              ))}
              {report.services.length === 0 ? <p className={styles.meta}>No services in this period.</p> : null}
            </div>
          </div>
          <div className={styles.card}>
            <h2>Chairs</h2>
            <div className={styles.list}>
              {report.barbers.map((barber) => (
                <div key={barber.barberId}>
                  <p>
                    {barber.name} · {barber.load}% · {barber.occupiedMin} / {barber.availableMin} min
                  </p>
                  <div className={styles.track}>
                    <span style={{ width: `${Math.min(barber.load, 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className={styles.card}>
            <h2>Day and hour</h2>
            <div className={styles.heatWrap}>
              <div className={styles.heat}>
                <span />
                {days.map((day) => (
                  <b key={day}>{day}</b>
                ))}
                {hours.map((hour) => (
                  <div key={hour} className={styles.heatRow}>
                    <span className={styles.hour}>{hour}</span>
                    {days.map((day, index) => {
                      const count = report.heatmap[index]?.[hour] ?? 0;
                      return <span key={day} className={styles.swatch} style={{ opacity: count ? 0.2 + (count / peak) * 0.8 : 0.08 }} title={`${day} ${hour}:00 · ${count}`} />;
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
