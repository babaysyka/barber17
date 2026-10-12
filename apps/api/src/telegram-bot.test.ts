import assert from "node:assert/strict";
import test from "node:test";
import type { PrismaClient } from "@prisma/client";
import {
  barberNotice,
  claimBarberLink,
  clientNotice,
  formatWhen,
  linkBookingChat,
  parseStartPayload,
  telegramMode,
  webhookAllowed,
} from "./telegram-bot.js";

const token = "11111111-1111-4111-8111-111111111111";

test("start payloads split a booking link from a barber link", () => {
  assert.deepEqual(parseStartPayload(`/start b_${token}`), { type: "booking", token });
  assert.deepEqual(parseStartPayload("/start barber_abcDEF12"), { type: "barber", code: "abcDEF12" });
  assert.deepEqual(parseStartPayload("/start"), { type: "menu" });
});

test("visit notices name the change", () => {
  const when = formatWhen(new Date("2026-10-10T06:00:00.000Z"));
  assert.match(clientNotice("created", { services: "Classic cut", barber: "Aziz Karimov", when }), /The chair is held/);
  assert.match(clientNotice("cancelled", { services: "Classic cut", barber: "Aziz Karimov", when }), /cancelled/);
  assert.match(clientNotice("moved", { services: "Classic cut", barber: "Aziz Karimov", when }), /moved/);
  assert.match(barberNotice("created", { client: "Stage", services: "Classic cut", when }), /New visit/);
  assert.match(when, /11:00/);
});

test("a booking link stores the Telegram chat on that guest", async () => {
  const updates: unknown[] = [];
  const prisma = {
    booking: {
      findUnique: async () => ({
        clientId: "client-1",
        client: { telegramId: null },
        barber: { name: "Aziz Karimov" },
        services: [],
        status: "confirmed",
        startsAt: new Date(),
      }),
    },
    client: {
      findUnique: async () => null,
      update: async (args: unknown) => {
        updates.push(args);
      },
    },
  } as unknown as PrismaClient;
  const result = await linkBookingChat(prisma, token, "42", "42");
  assert.equal(result.ok, true);
  assert.equal(updates.length, 1);
});

test("a second guest cannot take a linked visit", async () => {
  const prisma = {
    booking: {
      findUnique: async () => ({
        clientId: "client-1",
        client: { telegramId: "7" },
      }),
    },
    client: { findUnique: async () => null },
  } as unknown as PrismaClient;
  const result = await linkBookingChat(prisma, token, "42", "42");
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "taken");
});

test("a barber link is single use", async () => {
  const store = new Map<string, string>([["barber_link:abcDEF12", `aziz|${new Date(Date.now() + 60_000).toISOString()}`]]);
  const chats: string[] = [];
  const prisma = {
    setting: {
      findUnique: async ({ where }: { where: { key: string } }) => {
        const value = store.get(where.key);
        return value ? { value } : null;
      },
      delete: async ({ where }: { where: { key: string } }) => {
        if (!store.delete(where.key)) throw new Error("missing");
      },
    },
    barber: {
      update: async ({ data }: { data: { telegramChatId: string } }) => {
        chats.push(data.telegramChatId);
      },
    },
  } as unknown as PrismaClient;
  assert.equal(await claimBarberLink(prisma, "abcDEF12", "99"), "ok");
  assert.deepEqual(chats, ["99"]);
  assert.equal(await claimBarberLink(prisma, "abcDEF12", "100"), "missing");
});

test("Vercel uses the webhook and does not poll", () => {
  assert.equal(telegramMode({}), "polling");
  assert.equal(telegramMode({ TELEGRAM_WEBHOOK_URL: "https://api.example.com/telegram/webhook" }), "webhook");
  assert.equal(telegramMode({ VERCEL: "1" }), "webhook");
});

test("webhook secret is checked only when it is set", () => {
  assert.equal(webhookAllowed(undefined, undefined), true);
  assert.equal(webhookAllowed("nope", "secret"), false);
  assert.equal(webhookAllowed("secret", "secret"), true);
});
