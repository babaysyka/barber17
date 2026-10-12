import type { PrismaClient } from "@prisma/client";
import { planReminders, type ReminderAction, type ReminderRow, type ReminderSettings } from "./reminder-rules.js";

export type ReminderStore = {
  loadSettings(): Promise<ReminderSettings>;
  loadRows(now: Date): Promise<ReminderRow[]>;
  claim(action: ReminderAction, now: Date): Promise<boolean>;
  release(action: ReminderAction): Promise<void>;
};

export async function runReminders(
  store: ReminderStore,
  send: (action: Exclude<ReminderAction, { type: "complete" }>) => Promise<boolean>,
  now = new Date(),
) {
  const actions = planReminders(await store.loadRows(now), now, await store.loadSettings());
  const sent: string[] = [];
  const completed: string[] = [];
  for (const action of actions) {
    if (!(await store.claim(action, now))) continue;
    if (action.type === "complete") {
      completed.push(action.id);
      continue;
    }
    const ok = await send(action);
    if (!ok) {
      await store.release(action);
      continue;
    }
    sent.push(`${action.type}:${action.id}`);
  }
  return { sent, completed };
}

function readMinutes(map: Map<string, string>, key: string, fallback: number) {
  const value = Number(map.get(key));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function createPrismaStore(prisma: PrismaClient): ReminderStore {
  return {
    async loadSettings() {
      const rows = await prisma.setting.findMany({
        where: { key: { in: ["reminder_day_minutes", "reminder_short_minutes", "review_delay_min"] } },
      });
      const map = new Map(rows.map((row) => [row.key, row.value]));
      return {
        dayMinutes: readMinutes(map, "reminder_day_minutes", 1440),
        shortMinutes: readMinutes(map, "reminder_short_minutes", 30),
        reviewDelayMin: readMinutes(map, "review_delay_min", 60),
      };
    },
    async loadRows(now) {
      const horizon = new Date(now.getTime() + 26 * 60 * 60 * 1000);
      const past = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const rows = await prisma.booking.findMany({
        where: {
          OR: [
            { status: "confirmed", startsAt: { lte: horizon }, endsAt: { gte: past } },
            { status: "completed", reviewRequestedAt: null, endsAt: { gte: past } },
          ],
        },
        include: { client: true, barber: true, services: true },
      });
      return rows.map((row) => ({
        id: row.id,
        status: row.status,
        startsAt: row.startsAt.toISOString(),
        endsAt: row.endsAt.toISOString(),
        reminderDaySentAt: row.reminderDaySentAt?.toISOString() ?? null,
        reminder30mSentAt: row.reminder30mSentAt?.toISOString() ?? null,
        reviewRequestedAt: row.reviewRequestedAt?.toISOString() ?? null,
        chatId: row.client.telegramChatId,
        clientName: row.client.name,
        barberName: row.barber.name,
        services: row.services.map((service) => service.name).join(", "),
      }));
    },
    async claim(action, now) {
      if (action.type === "complete") {
        const result = await prisma.booking.updateMany({
          where: { id: action.id, status: "confirmed", autoCompletedAt: null },
          data: { status: "completed", autoCompletedAt: now },
        });
        return result.count === 1;
      }
      if (action.type === "day") {
        const result = await prisma.booking.updateMany({
          where: { id: action.id, status: "confirmed", reminderDaySentAt: null },
          data: { reminderDaySentAt: now },
        });
        return result.count === 1;
      }
      if (action.type === "short") {
        const result = await prisma.booking.updateMany({
          where: { id: action.id, status: "confirmed", reminder30mSentAt: null },
          data: { reminder30mSentAt: now },
        });
        return result.count === 1;
      }
      const result = await prisma.booking.updateMany({
        where: { id: action.id, status: "completed", reviewRequestedAt: null },
        data: { reviewRequestedAt: now },
      });
      return result.count === 1;
    },
    async release(action) {
      if (action.type === "day") {
        await prisma.booking.update({ where: { id: action.id }, data: { reminderDaySentAt: null } });
      } else if (action.type === "short") {
        await prisma.booking.update({ where: { id: action.id }, data: { reminder30mSentAt: null } });
      } else if (action.type === "review") {
        await prisma.booking.update({ where: { id: action.id }, data: { reviewRequestedAt: null } });
      }
    },
  };
}
