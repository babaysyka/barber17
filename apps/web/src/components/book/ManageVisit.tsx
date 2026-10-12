"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { formatDayParts } from "@/lib/slots";
import styles from "./ManageVisit.module.css";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type Booking = {
  manageToken: string;
  status: string;
  startsAt: string;
  endsAt: string;
  totalPrice: number;
  totalDurationMin: number;
  canChange: boolean;
  barber: { id: string; name: string };
  client: { name: string; phone: string };
  services: { id: string; name: string; durationMin: number; price: number }[];
};

type DayItem = { iso: string; weekday: string; day: string; month: string; open: boolean };
type TimeSlot = { startsAt: string; label: string };

function money(price: number) {
  return `${price.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")} UZS`;
}

function when(iso: string) {
  const date = new Date(iso);
  const day = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tashkent",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(date);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tashkent",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const bag = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { day, time: `${bag.hour === "24" ? "00" : bag.hour}:${bag.minute}` };
}

export function ManageVisit({ token }: { token: string }) {
  const [booking, setBooking] = useState<Booking | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [message, setMessage] = useState("");
  const [moving, setMoving] = useState(false);
  const [days, setDays] = useState<DayItem[]>([]);
  const [daysStatus, setDaysStatus] = useState<"idle" | "loading" | "error">("idle");
  const [date, setDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<TimeSlot[]>([]);
  const [slotStatus, setSlotStatus] = useState<"idle" | "loading" | "empty" | "error">("idle");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API}/api/v1/bookings/${token}`, { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 404) {
          setStatus("missing");
          return;
        }
        if (!response.ok) throw new Error("load");
        setBooking((await response.json()) as Booking);
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setStatus("error");
      });
    return () => controller.abort();
  }, [token]);

  async function cancel() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`${API}/api/v1/bookings/${token}/cancel`, { method: "POST" });
      const body = (await response.json()) as Booking & { message?: string };
      if (!response.ok) {
        setMessage(body.message ?? "The visit was not cancelled.");
        return;
      }
      setBooking(body);
      setMoving(false);
    } catch {
      setMessage("The visit was not cancelled.");
    } finally {
      setBusy(false);
    }
  }

  async function openMove() {
    if (!booking) return;
    setMoving(true);
    setDaysStatus("loading");
    setMessage("");
    const serviceIds = booking.services.map((service) => service.id).join(",");
    try {
      const response = await fetch(
        `${API}/api/v1/availability/days?serviceIds=${encodeURIComponent(serviceIds)}&barberId=${encodeURIComponent(booking.barber.id)}`,
      );
      if (!response.ok) throw new Error("days");
      const body = (await response.json()) as { days: { date: string; open: boolean }[] };
      setDays(body.days.map((item) => ({ iso: item.date, open: item.open, ...formatDayParts(item.date) })));
      setDaysStatus("idle");
    } catch {
      setDaysStatus("error");
    }
  }

  async function chooseDate(iso: string) {
    if (!booking) return;
    setDate(iso);
    setSlotStatus("loading");
    const serviceIds = booking.services.map((service) => service.id).join(",");
    try {
      const response = await fetch(
        `${API}/api/v1/availability?serviceIds=${encodeURIComponent(serviceIds)}&barberId=${encodeURIComponent(booking.barber.id)}&date=${iso}`,
      );
      if (!response.ok) throw new Error("slots");
      const body = (await response.json()) as { slots: TimeSlot[] };
      setSlots(body.slots);
      setSlotStatus(body.slots.length === 0 ? "empty" : "idle");
    } catch {
      setSlotStatus("error");
    }
  }

  async function moveTo(startsAt: string) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`${API}/api/v1/bookings/${token}/reschedule`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ startsAt }),
      });
      const body = (await response.json()) as Booking & { message?: string; code?: string };
      if (!response.ok) {
        setMessage(body.code === "SLOT_TAKEN" ? "That hour was just taken." : (body.message ?? "The visit was not moved."));
        return;
      }
      setBooking(body);
      setMoving(false);
      setDate(null);
      setSlots([]);
    } catch {
      setMessage("The visit was not moved.");
    } finally {
      setBusy(false);
    }
  }

  const visit = booking ? when(booking.startsAt) : null;

  return (
    <div className={styles.page}>
      <p className={styles.kicker}>Your visit</p>
      {status === "loading" ? <p className={styles.note}>Opening the visit.</p> : null}
      {status === "missing" ? <p className={styles.note}>This visit does not exist.</p> : null}
      {status === "error" ? <p className={styles.note}>The visit did not load.</p> : null}
      {booking && visit ? (
        <>
          <h1 className={styles.title}>{booking.status === "cancelled" ? "The visit is cancelled." : "The chair is held."}</h1>
          <p className={styles.lead}>
            {booking.services.map((service) => service.name).join(", ")} with {booking.barber.name}
            <br />
            {visit.day} at {visit.time}
            <br />
            {booking.totalDurationMin} min · {money(booking.totalPrice)}
          </p>
          <p className={styles.note}>
            {booking.client.name}
            <br />
            {booking.client.phone}
          </p>
          {message ? <p className={styles.note}>{message}</p> : null}
          {booking.canChange ? (
            <div className={styles.actions}>
              <button className="cta" type="button" disabled={busy} onClick={() => void cancel()}>
                Cancel the visit
              </button>
              <button className={styles.textButton} type="button" disabled={busy} onClick={() => void openMove()}>
                Move it
              </button>
            </div>
          ) : null}
          {moving ? (
            <div>
              {daysStatus === "loading" ? <p className={styles.note}>Looking for open days.</p> : null}
              {daysStatus === "error" ? <p className={styles.note}>Days did not load.</p> : null}
              <div className={styles.dates}>
                {days.map((item) => (
                  <button
                    key={item.iso}
                    type="button"
                    className={styles.date}
                    disabled={!item.open || busy}
                    aria-pressed={date === item.iso}
                    onClick={() => void chooseDate(item.iso)}
                  >
                    <span>{item.weekday}</span>
                    <strong>{item.day}</strong>
                    <span>{item.month}</span>
                  </button>
                ))}
              </div>
              {slotStatus === "loading" ? <p className={styles.note}>Looking for an open chair.</p> : null}
              {slotStatus === "empty" ? <p className={styles.note}>No open chairs on this day.</p> : null}
              {slotStatus === "error" ? <p className={styles.note}>Times did not load.</p> : null}
              <div className={styles.times}>
                {slots.map((slot) => (
                  <button key={slot.startsAt} className={styles.time} type="button" disabled={busy} onClick={() => void moveTo(slot.startsAt)}>
                    {slot.label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </>
      ) : null}
      <p className={styles.actions}>
        <Link className={styles.textButton} href="/">
          Return home
        </Link>
      </p>
    </div>
  );
}
