import assert from "node:assert/strict";
import test from "node:test";
import { slotsForBarber, totalDuration, zonedToUtc, type BarberDay } from "./slots.js";

const zone = "Asia/Tashkent";
const now = new Date("2026-10-06T01:00:00.000Z");

function day(hours: BarberDay["hours"], extra: Partial<BarberDay> = {}): BarberDay {
  return {
    durationMin: 45,
    hours,
    breaks: [],
    ...extra,
  };
}

function labels(slots: { label: string }[]) {
  return slots.map((slot) => slot.label);
}

test("total duration adds every selected service", () => {
  assert.equal(totalDuration([45, 30, 40]), 115);
});

test("slots follow working hours and the step", () => {
  const slots = slotsForBarber({
    date: "2026-10-06",
    now,
    timeZone: zone,
    stepMin: 15,
    minNoticeMin: 30,
    horizonDays: 30,
    barber: day([{ startMin: 11 * 60, endMin: 21 * 60 }]),
    timeOff: [],
    bookings: [],
  });
  assert.equal(slots[0]?.label, "11:00");
  assert.equal(slots.at(-1)?.label, "20:15");
  assert.equal(slots[0]?.startsAt, zonedToUtc("2026-10-06", 11 * 60, zone).toISOString());
});

test("a service must finish before the chair closes", () => {
  const slots = slotsForBarber({
    date: "2026-10-06",
    now,
    timeZone: zone,
    stepMin: 15,
    minNoticeMin: 0,
    horizonDays: 30,
    barber: day([{ startMin: 20 * 60, endMin: 21 * 60 }], { durationMin: 90 }),
    timeOff: [],
    bookings: [],
  });
  assert.deepEqual(labels(slots), []);
});

test("lunch removes overlapping starts and reopens after the break", () => {
  const slots = slotsForBarber({
    date: "2026-10-06",
    now,
    timeZone: zone,
    stepMin: 15,
    minNoticeMin: 0,
    horizonDays: 30,
    barber: day([{ startMin: 14 * 60, endMin: 17 * 60 }], {
      breaks: [{ startMin: 15 * 60, endMin: 15 * 60 + 30 }],
    }),
    timeOff: [],
    bookings: [],
  });
  const times = labels(slots);
  assert.equal(times.includes("14:15"), true);
  assert.equal(times.includes("14:30"), false);
  assert.equal(times.includes("15:00"), false);
  assert.equal(times.includes("15:15"), false);
  assert.equal(times.includes("15:30"), true);
});

test("time off and an existing booking block the chair", () => {
  const slots = slotsForBarber({
    date: "2026-10-06",
    now,
    timeZone: zone,
    stepMin: 60,
    minNoticeMin: 0,
    horizonDays: 30,
    barber: day([{ startMin: 11 * 60, endMin: 21 * 60 }], { durationMin: 60 }),
    timeOff: [
      {
        start: zonedToUtc("2026-10-06", 18 * 60, zone),
        end: zonedToUtc("2026-10-06", 21 * 60, zone),
      },
    ],
    bookings: [
      {
        start: zonedToUtc("2026-10-06", 12 * 60, zone),
        end: zonedToUtc("2026-10-06", 13 * 60, zone),
      },
    ],
  });
  const times = labels(slots);
  assert.equal(times.includes("11:00"), true);
  assert.equal(times.includes("12:00"), false);
  assert.equal(times.includes("13:00"), true);
  assert.equal(times.includes("18:00"), false);
  assert.equal(times.includes("17:00"), true);
});

test("min notice drops hours that are too soon", () => {
  const slots = slotsForBarber({
    date: "2026-10-06",
    now: zonedToUtc("2026-10-06", 10 * 60 + 50, zone),
    timeZone: zone,
    stepMin: 15,
    minNoticeMin: 30,
    horizonDays: 30,
    barber: day([{ startMin: 11 * 60, endMin: 13 * 60 }]),
    timeOff: [],
    bookings: [],
  });
  assert.equal(labels(slots).includes("11:00"), false);
  assert.equal(labels(slots)[0], "11:30");
});

test("dates outside the horizon are closed", () => {
  const slots = slotsForBarber({
    date: "2026-12-01",
    now,
    timeZone: zone,
    stepMin: 15,
    minNoticeMin: 0,
    horizonDays: 30,
    barber: day([{ startMin: 11 * 60, endMin: 21 * 60 }]),
    timeOff: [],
    bookings: [],
  });
  assert.deepEqual(slots, []);
});
