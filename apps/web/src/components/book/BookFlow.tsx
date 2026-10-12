"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { shop } from "@/data/content";
import type { BarberView, ServiceView } from "@/lib/catalog";
import { formatBookDate, formatDayParts } from "@/lib/slots";
import styles from "./BookFlow.module.css";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const STEPS = ["service", "barber", "date", "time", "details"] as const;
type Step = (typeof STEPS)[number] | "done";

const STEP_LABEL: Record<(typeof STEPS)[number], string> = {
  service: "Service",
  barber: "Barber",
  date: "Date",
  time: "Time",
  details: "Details",
};

const ANY = "any";

type TimeSlot = { startsAt: string; label: string };

type Slots =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "empty" }
  | { status: "error" }
  | { status: "ready"; times: TimeSlot[] };

type DayItem = { iso: string; weekday: string; day: string; month: string; open: boolean };

type DaysState = { status: "idle" | "loading" | "ready" | "error"; days: DayItem[] };

export function BookFlow({ services, barbers }: { services: ServiceView[]; barbers: BarberView[] }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const opened = useRef(false);
  const requestId = useRef(0);

  const [step, setStep] = useState<Step>("service");
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [barberId, setBarberId] = useState<string | null>(null);
  const [date, setDate] = useState<string | null>(null);
  const [time, setTime] = useState<string | null>(null);
  const [timeLabel, setTimeLabel] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [nameError, setNameError] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [manageToken, setManageToken] = useState<string | null>(null);
  const [telegramUrl, setTelegramUrl] = useState<string | null>(null);
  const [assignedName, setAssignedName] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slots>({ status: "idle" });
  const [daysState, setDaysState] = useState<DaysState>({ status: "idle", days: [] });
  const [submitting, setSubmitting] = useState(false);

  const service = services.find((item) => item.id === serviceId) ?? null;
  const barber = barbers.find((item) => item.id === barberId) ?? null;
  const barberLabel = assignedName ?? (barberId === ANY ? "Any available" : (barber?.name ?? null));
  const dateLabel = date ? formatBookDate(date) : null;

  useEffect(() => {
    return () => {
      requestId.current += 1;
    };
  }, []);

  useEffect(() => {
    if (!opened.current) {
      opened.current = true;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  async function loadDays(nextService = serviceId, nextBarber = barberId) {
    if (!nextService || !nextBarber) return;
    const id = ++requestId.current;
    setDaysState({ status: "loading", days: [] });
    try {
      const response = await fetch(
        `${API}/api/v1/availability/days?serviceIds=${encodeURIComponent(nextService)}&barberId=${encodeURIComponent(nextBarber)}`,
      );
      if (!response.ok) throw new Error("days");
      const body = (await response.json()) as { days: { date: string; open: boolean }[] };
      if (id !== requestId.current) return;
      setDaysState({
        status: "ready",
        days: body.days.map((item) => ({ iso: item.date, open: item.open, ...formatDayParts(item.date) })),
      });
    } catch {
      if (id !== requestId.current) return;
      setDaysState({ status: "error", days: [] });
    }
  }

  async function loadTimes(iso: string, nextService = serviceId, nextBarber = barberId) {
    if (!nextService || !nextBarber) return;
    const id = ++requestId.current;
    setTime(null);
    setTimeLabel(null);
    setSlots({ status: "loading" });
    try {
      const response = await fetch(
        `${API}/api/v1/availability?serviceIds=${encodeURIComponent(nextService)}&barberId=${encodeURIComponent(nextBarber)}&date=${iso}`,
      );
      if (!response.ok) throw new Error("times");
      const body = (await response.json()) as { slots: TimeSlot[] };
      if (id !== requestId.current) return;
      setSlots(body.slots.length === 0 ? { status: "empty" } : { status: "ready", times: body.slots });
    } catch {
      if (id !== requestId.current) return;
      setSlots({ status: "error" });
    }
  }

  function chooseDate(iso: string) {
    setDate(iso);
    void loadTimes(iso);
  }

  function retryTimes() {
    if (!date) return;
    void loadTimes(date);
  }

  function canOpen(target: (typeof STEPS)[number]) {
    if (target === "service") return true;
    if (target === "barber") return Boolean(serviceId);
    if (target === "date") return Boolean(serviceId && barberId);
    if (target === "time") return Boolean(serviceId && barberId && date);
    return Boolean(serviceId && barberId && date && time);
  }

  function canContinue() {
    if (step === "service") return Boolean(serviceId);
    if (step === "barber") return Boolean(barberId);
    if (step === "date") return Boolean(date && daysState.days.some((item) => item.iso === date && item.open));
    if (step === "time") return Boolean(time);
    return false;
  }

  function goNext() {
    const index = STEPS.indexOf(step as (typeof STEPS)[number]);
    const next = STEPS[index + 1];
    if (next === "date") void loadDays();
    if (next) setStep(next);
  }

  function goBack() {
    const index = STEPS.indexOf(step as (typeof STEPS)[number]);
    const previous = STEPS[index - 1];
    if (previous) setStep(previous);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextName = name.trim();
    const digits = phone.replace(/\D/g, "");
    const nextNameError = nextName.length < 2 ? "Enter your name." : "";
    const nextPhoneError = digits.length < 9 ? "Enter a phone number." : "";
    setNameError(nextNameError);
    setPhoneError(nextPhoneError);
    setSubmitError("");
    if (nextNameError || nextPhoneError || !serviceId || !barberId || !time) return;

    setSubmitting(true);
    try {
      const response = await fetch(`${API}/api/v1/bookings`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          serviceIds: [serviceId],
          barberId,
          startsAt: time,
          client: { name: nextName, phone: phone.trim() },
        }),
      });
      const body = (await response.json()) as {
        code?: string;
        message?: string;
        manageToken?: string;
        telegramUrl?: string | null;
        barber?: { name: string };
      };
      if (response.status === 409 || body.code === "SLOT_TAKEN") {
        setSubmitError("That hour was just taken.");
        setStep("time");
        if (date) void loadTimes(date);
        return;
      }
      if (!response.ok || !body.manageToken) {
        setSubmitError(body.message || "The visit was not saved.");
        return;
      }
      setManageToken(body.manageToken);
      setTelegramUrl(body.telegramUrl ?? null);
      if (body.barber?.name) setAssignedName(body.barber.name);
      setStep("done");
    } catch {
      setSubmitError("The visit was not saved.");
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setStep("service");
    setServiceId(null);
    setBarberId(null);
    setDate(null);
    setTime(null);
    setName("");
    setPhone("");
    setNameError("");
    setPhoneError("");
    setSubmitError("");
    setManageToken(null);
    setTelegramUrl(null);
    setAssignedName(null);
    setTimeLabel(null);
    setDaysState({ status: "idle", days: [] });
    setSlots({ status: "idle" });
  }

  const title =
    step === "service"
      ? "Choose the work."
      : step === "barber"
        ? "Choose the hands."
        : step === "date"
          ? "Choose the day."
          : step === "time"
            ? "Choose the hour."
            : step === "details"
              ? "Who is coming."
              : "The chair is held.";

  return (
    <div className={styles.page}>
      <div className={styles.layout}>
        <div>
          <p className={styles.kicker}>Book a chair · {shop.city}</p>
          {step !== "done" ? (
            <ol className={styles.steps}>
              {STEPS.map((item) => (
                <li key={item}>
                  <button
                    type="button"
                    disabled={!canOpen(item)}
                    aria-current={step === item ? "step" : undefined}
                    onClick={() => {
                      if (item === "date") void loadDays();
                      setStep(item);
                    }}
                  >
                    {STEP_LABEL[item]}
                  </button>
                </li>
              ))}
            </ol>
          ) : null}

          <h1 ref={headingRef} tabIndex={-1} className={styles.title}>
            {title}
          </h1>

          {step === "service" ? (
            <div className={styles.list} role="group" aria-label="Services">
              {services.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={styles.service}
                  aria-pressed={serviceId === item.id}
                  onClick={() => setServiceId(item.id)}
                >
                  <span className={styles.index}>{item.index}</span>
                  <span>
                    <span className={styles.serviceName}>{item.name}</span>
                    <span className={styles.meta}>{item.meta}</span>
                  </span>
                </button>
              ))}
            </div>
          ) : null}

          {step === "barber" ? (
            <div>
              <button
                type="button"
                className={styles.any}
                aria-pressed={barberId === ANY}
                onClick={() => setBarberId(ANY)}
              >
                <span className={styles.serviceName}>Any available</span>
                <span className={styles.meta}>The first open chair that day</span>
              </button>
              <div className={styles.barbers} role="group" aria-label="Barbers">
                {barbers.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={styles.barber}
                    aria-pressed={barberId === item.id}
                    onClick={() => setBarberId(item.id)}
                  >
                    <Image
                      src={item.image}
                      alt=""
                      width={480}
                      height={640}
                      sizes="(min-width: 800px) 18vw, 45vw"
                    />
                    <span className={styles.barberName}>{item.name}</span>
                    <span className={styles.meta}>
                      {item.focus} · {item.years}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {step === "date" ? (
            <div>
              <p className={styles.note}>Tuesday–Sunday. Monday is closed.</p>
              {daysState.status === "loading" ? <p className={styles.state}>Looking for open days.</p> : null}
              {daysState.status === "error" ? (
                <div className={styles.state}>
                  <p>Days did not load.</p>
                  <button type="button" className={styles.textButton} onClick={() => void loadDays()}>
                    Try again
                  </button>
                </div>
              ) : null}
              {daysState.status === "ready" ? (
                <div className={styles.dates} role="group" aria-label="Dates">
                  {daysState.days.map((item) => (
                    <button
                      key={item.iso}
                      type="button"
                      className={styles.date}
                      disabled={!item.open}
                      aria-pressed={date === item.iso}
                      onClick={() => chooseDate(item.iso)}
                    >
                      <span>{item.weekday}</span>
                      <strong>{item.day}</strong>
                      <span>{item.month}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {step === "time" ? (
            <div aria-busy={slots.status === "loading"} aria-live="polite">
              <p className={styles.note}>{dateLabel}</p>
              {slots.status === "loading" ? <p className={styles.state}>Looking for an open chair.</p> : null}
              {slots.status === "empty" ? (
                <div className={styles.state}>
                  <p>No open chairs on this day.</p>
                  <button type="button" className={styles.textButton} onClick={() => setStep("date")}>
                    Choose another date
                  </button>
                </div>
              ) : null}
              {slots.status === "error" ? (
                <div className={styles.state}>
                  <p>Times did not load.</p>
                  <button type="button" className={styles.textButton} onClick={retryTimes}>
                    Try again
                  </button>
                </div>
              ) : null}
              {slots.status === "ready" ? (
                <div className={styles.times} role="group" aria-label="Times">
                  {slots.times.map((slot) => (
                    <button
                      key={slot.startsAt}
                      type="button"
                      className={styles.time}
                      aria-pressed={time === slot.startsAt}
                      onClick={() => {
                        setTime(slot.startsAt);
                        setTimeLabel(slot.label);
                      }}
                    >
                      {slot.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {step === "details" ? (
            <form id="booking-details" className={styles.form} onSubmit={submit} noValidate>
              <label className={styles.field}>
                <span>Name</span>
                <input
                  name="name"
                  autoComplete="name"
                  value={name}
                  aria-invalid={nameError ? true : undefined}
                  aria-describedby={nameError ? "name-error" : undefined}
                  onChange={(event) => {
                    setName(event.target.value);
                    setNameError("");
                  }}
                />
                {nameError ? (
                  <span id="name-error" className={styles.fieldError}>
                    {nameError}
                  </span>
                ) : null}
              </label>
              <label className={styles.field}>
                <span>Phone</span>
                <input
                  name="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder="+998"
                  value={phone}
                  aria-invalid={phoneError ? true : undefined}
                  aria-describedby={phoneError ? "phone-error" : undefined}
                  onChange={(event) => {
                    setPhone(event.target.value);
                    setPhoneError("");
                  }}
                />
                {phoneError ? (
                  <span id="phone-error" className={styles.fieldError}>
                    {phoneError}
                  </span>
                ) : null}
              </label>
            </form>
          ) : null}

          {step === "done" && service && barberLabel && dateLabel && timeLabel && manageToken ? (
            <div className={styles.confirm}>
              <p>
                {service.name} with {barberLabel}
                <br />
                {dateLabel} at {timeLabel}
              </p>
              <p>
                {name.trim()}
                <br />
                {phone.trim()}
              </p>
              <div className={styles.actions}>
                <Link className="cta" href={`/booking/${manageToken}`}>
                  Manage this visit
                </Link>
                {telegramUrl ? (
                  <a className={styles.textButton} href={telegramUrl} rel="noreferrer">
                    Open in Telegram
                  </a>
                ) : null}
                <button type="button" className={styles.textButton} onClick={reset}>
                  Book another
                </button>
              </div>
            </div>
          ) : null}

          {submitError ? <p className={styles.note}>{submitError}</p> : null}

          {step !== "done" ? (
            <div className={styles.actions}>
              {step !== "service" ? (
                <button type="button" className={styles.textButton} onClick={goBack}>
                  Back
                </button>
              ) : (
                <Link className={styles.textButton} href="/">
                  Home
                </Link>
              )}
              {step === "details" ? (
                <button className="cta" type="submit" form="booking-details" disabled={submitting}>
                  {submitting ? "Reserving…" : "Reserve"}
                </button>
              ) : (
                <button className="cta" type="button" disabled={!canContinue()} onClick={goNext}>
                  Continue
                </button>
              )}
            </div>
          ) : null}
        </div>

        <aside className={styles.summary} aria-label="Booking summary">
          <p className={styles.kicker}>Your visit</p>
          <dl>
            <div>
              <dt>Service</dt>
              <dd>{service ? service.name : "—"}</dd>
            </div>
            <div>
              <dt>Time in the chair</dt>
              <dd>{service ? service.meta : "—"}</dd>
            </div>
            <div>
              <dt>Barber</dt>
              <dd>{barberLabel ?? "—"}</dd>
            </div>
            <div>
              <dt>Date</dt>
              <dd>{dateLabel ?? "—"}</dd>
            </div>
            <div>
              <dt>Hour</dt>
              <dd>{timeLabel ?? "—"}</dd>
            </div>
            {step === "details" || step === "done" ? (
              <div>
                <dt>Guest</dt>
                <dd>{name.trim() || "—"}</dd>
              </div>
            ) : null}
          </dl>
          <p className={styles.note}>
            {shop.address}
            <br />
            {shop.hours}
          </p>
        </aside>
      </div>
    </div>
  );
}
