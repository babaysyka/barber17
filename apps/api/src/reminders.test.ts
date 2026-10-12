import assert from "node:assert/strict";
import test from "node:test";
import { planReminders, type ReminderRow } from "./reminder-rules.js";
import { runReminders, type ReminderStore } from "./reminders.js";

const now = new Date("2026-10-09T12:00:00.000Z");
const settings = { dayMinutes: 1440, shortMinutes: 30, reviewDelayMin: 60 };

function row(partial: Partial<ReminderRow> & Pick<ReminderRow, "id" | "startsAt" | "endsAt">): ReminderRow {
  return {
    status: "confirmed",
    reminderDaySentAt: null,
    reminder30mSentAt: null,
    reviewRequestedAt: null,
    chatId: "42",
    clientName: "Stage",
    barberName: "Aziz Karimov",
    services: "Classic cut",
    ...partial,
  };
}

test("day, short, completion and review each fall in their own window", () => {
  const day = planReminders(
    [row({ id: "day", startsAt: "2026-10-10T11:30:00.000Z", endsAt: "2026-10-10T12:15:00.000Z" })],
    now,
    settings,
  );
  assert.deepEqual(day.map((item) => item.type), ["day"]);

  const soon = planReminders(
    [row({ id: "soon", startsAt: "2026-10-09T12:20:00.000Z", endsAt: "2026-10-09T13:05:00.000Z" })],
    now,
    settings,
  );
  assert.deepEqual(soon.map((item) => item.type), ["short"]);

  const past = planReminders(
    [row({ id: "past", startsAt: "2026-10-09T09:00:00.000Z", endsAt: "2026-10-09T10:00:00.000Z" })],
    now,
    settings,
  );
  assert.deepEqual(past.map((item) => item.type), ["complete", "review"]);

  const quiet = planReminders(
    [row({ id: "later", startsAt: "2026-10-12T12:00:00.000Z", endsAt: "2026-10-12T12:45:00.000Z" })],
    now,
    settings,
  );
  assert.deepEqual(quiet, []);
});

test("a second run does not send the same reminder", async () => {
  const visits = [
    row({ id: "day", startsAt: "2026-10-10T11:30:00.000Z", endsAt: "2026-10-10T12:15:00.000Z" }),
  ];
  const sent: string[] = [];
  const store: ReminderStore = {
    async loadSettings() {
      return settings;
    },
    async loadRows() {
      return visits.map((visit) => ({ ...visit }));
    },
    async claim(action) {
      const visit = visits.find((item) => item.id === action.id);
      if (!visit) return false;
      if (action.type === "day") {
        if (visit.reminderDaySentAt) return false;
        visit.reminderDaySentAt = now.toISOString();
        return true;
      }
      return false;
    },
    async release(action) {
      const visit = visits.find((item) => item.id === action.id);
      if (visit && action.type === "day") visit.reminderDaySentAt = null;
    },
  };
  const first = await runReminders(store, async (action) => {
    sent.push(action.type);
    return true;
  }, now);
  const second = await runReminders(store, async (action) => {
    sent.push(action.type);
    return true;
  }, now);
  assert.deepEqual(first.sent, ["day:day"]);
  assert.deepEqual(second.sent, []);
  assert.deepEqual(sent, ["day"]);
});

test("a failed send is retried on the next run", async () => {
  const visits = [
    row({ id: "soon", startsAt: "2026-10-09T12:20:00.000Z", endsAt: "2026-10-09T13:05:00.000Z" }),
  ];
  let fail = true;
  const sent: string[] = [];
  const store: ReminderStore = {
    async loadSettings() {
      return settings;
    },
    async loadRows() {
      return visits.map((visit) => ({ ...visit }));
    },
    async claim(action) {
      const visit = visits.find((item) => item.id === action.id);
      if (!visit || action.type !== "short" || visit.reminder30mSentAt) return false;
      visit.reminder30mSentAt = now.toISOString();
      return true;
    },
    async release(action) {
      const visit = visits.find((item) => item.id === action.id);
      if (visit && action.type === "short") visit.reminder30mSentAt = null;
    },
  };
  await runReminders(store, async () => {
    if (fail) return false;
    sent.push("short");
    return true;
  }, now);
  fail = false;
  await runReminders(store, async () => {
    sent.push("short");
    return true;
  }, now);
  assert.deepEqual(sent, ["short"]);
  assert.equal(visits[0]?.reminder30mSentAt, now.toISOString());
});
