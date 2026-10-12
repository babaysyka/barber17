import assert from "node:assert/strict";
import { config } from "dotenv";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { collectSlots } from "./availability.js";
import { createBooking } from "./bookings.js";
import { ApiError } from "./errors.js";
import { addDays, calendarDate, isoWeekday, zonedToUtc } from "./slots.js";

config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env") });

function nextOpenDate(timeZone: string) {
  const today = calendarDate(new Date(), timeZone);
  for (let offset = 1; offset < 14; offset += 1) {
    const date = addDays(today, offset);
    if (isoWeekday(date) !== 1) return date;
  }
  return addDays(today, 1);
}

test("two parallel bookings for one chair produce a single confirmation", async () => {
  const prisma = new PrismaClient();
  const created: string[] = [];
  try {
    const date = nextOpenDate("Asia/Tashkent");
    const startsAt = zonedToUtc(date, 11 * 60, "Asia/Tashkent");
    const probe = await collectSlots(prisma, {
      serviceIds: ["cut"],
      barberId: "aziz",
      date,
      now: new Date(),
    });
    assert.equal(
      probe.slots.some((slot) => slot.startsAt === startsAt.toISOString()),
      true,
      "11:00 should be open for the race",
    );

    await prisma.booking.deleteMany({ where: { barberId: "aziz", startsAt } });

    const input = {
      serviceIds: ["cut"],
      barberId: "aziz",
      startsAt,
      client: { name: "Race Guest", phone: "+998900000001" },
    };
    const results = await Promise.allSettled([createBooking(prisma, input), createBooking(prisma, input)]);
    const ok = results.filter((result) => result.status === "fulfilled");
    const denied = results.filter(
      (result) => result.status === "rejected" && result.reason instanceof ApiError && result.reason.code === "SLOT_TAKEN",
    );
    for (const result of ok) {
    if (result.status === "fulfilled" && result.value) created.push(result.value.id);
    }
    assert.equal(ok.length, 1);
    assert.equal(denied.length, 1);
  } finally {
    if (created.length > 0) {
      const rows = await prisma.booking.findMany({ where: { id: { in: created } }, select: { id: true, clientId: true } });
      await prisma.booking.deleteMany({ where: { id: { in: rows.map((row) => row.id) } } });
      await prisma.client.deleteMany({ where: { id: { in: rows.map((row) => row.clientId) } } });
    }
    await prisma.$disconnect();
  }
});
