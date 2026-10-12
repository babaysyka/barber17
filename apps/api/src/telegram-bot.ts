import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { Bot, InlineKeyboard, Keyboard } from "grammy";
import type { FastifyInstance } from "fastify";
import { cancelBooking } from "./bookings.js";

export type VisitKind = "created" | "cancelled" | "moved";

type Sender = {
  sendMessage: (
    chatId: string,
    text: string,
    extra?: { reply_markup?: InlineKeyboard },
  ) => Promise<unknown>;
};

let sender: Sender | null = null;
let running: Bot | null = null;
let username = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "") || "";

export function botUsername() {
  return username;
}

export function telegramVisitUrl(manageToken: string) {
  if (!username) return null;
  return `https://t.me/${username}?start=b_${manageToken}`;
}

export function parseStartPayload(text: string | undefined) {
  const payload = text?.match(/^\/start(?:@\w+)?(?:\s+(\S+))?$/)?.[1] ?? "";
  if (/^b_[0-9a-f-]{36}$/i.test(payload)) return { type: "booking" as const, token: payload.slice(2) };
  if (/^barber_[A-Za-z0-9_-]{8,32}$/.test(payload)) return { type: "barber" as const, code: payload.slice("barber_".length) };
  return { type: "menu" as const };
}

export function formatWhen(startsAt: Date) {
  const day = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tashkent",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(startsAt);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tashkent",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(startsAt);
  const bag = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${day}, ${bag.hour === "24" ? "00" : bag.hour}:${bag.minute}`;
}

export function clientNotice(kind: VisitKind, visit: { services: string; barber: string; when: string }) {
  const title = kind === "created" ? "The chair is held." : kind === "cancelled" ? "The visit is cancelled." : "The visit moved.";
  return `${title}\n${visit.services} with ${visit.barber}\n${visit.when}`;
}

export function barberNotice(kind: VisitKind, visit: { client: string; services: string; when: string }) {
  const title = kind === "created" ? "New visit." : kind === "cancelled" ? "A visit was cancelled." : "A visit moved.";
  return `${title}\n${visit.client}\n${visit.services}\n${visit.when}`;
}

export function webhookAllowed(header: string | string[] | undefined, secret: string | undefined) {
  if (!secret) return true;
  return header === secret;
}

const menu = new Keyboard().text("My visits").text("Book").resized();

export async function issueBarberLinkCode(prisma: PrismaClient, barberId: string) {
  const code = randomBytes(9).toString("base64url");
  const expires = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  await prisma.setting.create({
    data: { key: `barber_link:${code}`, value: `${barberId}|${expires}` },
  });
  return code;
}

export async function claimBarberLink(prisma: PrismaClient, code: string, chatId: string) {
  const key = `barber_link:${code}`;
  const row = await prisma.setting.findUnique({ where: { key } });
  if (!row) return "missing" as const;
  const [barberId, expires] = row.value.split("|");
  if (!barberId || !expires || Date.parse(expires) < Date.now()) {
    await prisma.setting.delete({ where: { key } }).catch(() => undefined);
    return "expired" as const;
  }
  try {
    await prisma.setting.delete({ where: { key } });
  } catch {
    return "used" as const;
  }
  await prisma.barber.update({ where: { id: barberId }, data: { telegramChatId: chatId } });
  return "ok" as const;
}

export async function linkBookingChat(
  prisma: PrismaClient,
  manageToken: string,
  telegramId: string,
  chatId: string,
) {
  const booking = await prisma.booking.findUnique({
    where: { manageToken },
    include: { client: true, barber: true, services: true },
  });
  if (!booking) return { ok: false as const, reason: "missing" as const };
  const taken = await prisma.client.findUnique({ where: { telegramId } });
  if ((taken && taken.id !== booking.clientId) || (booking.client.telegramId && booking.client.telegramId !== telegramId)) {
    return { ok: false as const, reason: "taken" as const };
  }
  await prisma.client.update({
    where: { id: booking.clientId },
    data: { telegramId, telegramChatId: chatId },
  });
  return { ok: true as const, booking };
}

export async function notifyVisit(prisma: PrismaClient, bookingId: string, kind: VisitKind) {
  if (!sender) return;
  const booking = await prisma.booking.findUnique({
    where: { id: bookingId },
    include: { client: true, barber: true, services: true },
  });
  if (!booking) return;
  const when = formatWhen(booking.startsAt);
  const services = booking.services.map((service) => service.name).join(", ");
  const clientChat = booking.client.telegramChatId;
  const barberChat = booking.barber.telegramChatId;
  if (clientChat) {
    const markup = kind === "created" && booking.status === "confirmed" ? new InlineKeyboard().text("Cancel this visit", `cancel:${booking.manageToken}`) : undefined;
    await sender.sendMessage(clientChat, clientNotice(kind, { services, barber: booking.barber.name, when }), markup ? { reply_markup: markup } : undefined).catch(logTelegram);
  }
  if (barberChat && barberChat !== clientChat) {
    await sender
      .sendMessage(barberChat, barberNotice(kind, { client: booking.client.name, services, when }))
      .catch(logTelegram);
  }
}

function logTelegram(error: unknown) {
  console.error(error instanceof Error ? error.message : "Telegram send failed");
}

export async function sendTelegram(chatId: string, text: string, markup?: InlineKeyboard) {
  if (!sender) return false;
  try {
    await sender.sendMessage(chatId, text, markup ? { reply_markup: markup } : undefined);
    return true;
  } catch (error) {
    logTelegram(error);
    return false;
  }
}

async function rememberChat(prisma: PrismaClient, telegramId: string, chatId: string) {
  await prisma.client.updateMany({ where: { telegramId }, data: { telegramChatId: chatId } });
}

async function sendVisits(prisma: PrismaClient, telegramId: string, chatId: string) {
  const client = await prisma.client.findFirst({
    where: { OR: [{ telegramId }, { telegramChatId: chatId }] },
    include: {
      bookings: {
        where: { status: "confirmed", startsAt: { gte: new Date() } },
        include: { services: true, barber: true },
        orderBy: { startsAt: "asc" },
        take: 8,
      },
    },
  });
  if (!client || client.bookings.length === 0) return "No visits yet.";
  return client.bookings
    .map((booking) => {
      const services = booking.services.map((service) => service.name).join(", ");
      return clientNotice("created", { services, barber: booking.barber.name, when: formatWhen(booking.startsAt) });
    })
    .join("\n\n");
}

function bookReply() {
  const url = process.env.TELEGRAM_MINI_APP_URL;
  if (url?.startsWith("https://")) {
    return { text: "Book the chair.", markup: new InlineKeyboard().webApp("Book a visit", url) };
  }
  return { text: "Book on the site. The confirmation opens this chat.", markup: undefined };
}

export async function stopTelegram() {
  if (!running) return;
  const bot = running;
  running = null;
  await bot.stop();
}

export function createTelegramBot(token: string, prisma: PrismaClient) {
  const bot = new Bot(token);
  sender = bot.api;

  bot.use(async (ctx, next) => {
    if (ctx.from && ctx.chat) await rememberChat(prisma, String(ctx.from.id), String(ctx.chat.id));
    await next();
  });

  bot.command("start", async (ctx) => {
    const parsed = parseStartPayload(ctx.message?.text);
    if (parsed.type === "barber") {
      const result = await claimBarberLink(prisma, parsed.code, String(ctx.chat.id));
      const text = result === "ok" ? "This chat will hear about new visits." : result === "expired" ? "That link has expired." : "That link is no longer valid.";
      await ctx.reply(text, { reply_markup: menu });
      return;
    }
    if (parsed.type === "booking") {
      const linked = await linkBookingChat(prisma, parsed.token, String(ctx.from?.id ?? ""), String(ctx.chat.id));
      if (!linked.ok) {
        await ctx.reply(linked.reason === "missing" ? "This visit does not exist." : "This Telegram account is already linked to another guest.", { reply_markup: menu });
        return;
      }
      const services = linked.booking.services.map((service) => service.name).join(", ");
      const kind: VisitKind = linked.booking.status === "cancelled" ? "cancelled" : linked.booking.status === "confirmed" ? "created" : "moved";
      const text = linked.booking.status === "confirmed" || linked.booking.status === "cancelled"
        ? clientNotice(kind, { services, barber: linked.booking.barber.name, when: formatWhen(linked.booking.startsAt) })
        : `This visit is ${linked.booking.status}.`;
      await ctx.reply(text, { reply_markup: menu });
      return;
    }
    await ctx.reply("Orda. Tuesday–Sunday, 11:00–21:00.", { reply_markup: menu });
  });

  bot.command("visits", async (ctx) => {
    await ctx.reply(await sendVisits(prisma, String(ctx.from?.id ?? ""), String(ctx.chat.id)), { reply_markup: menu });
  });
  bot.hears("My visits", async (ctx) => {
    await ctx.reply(await sendVisits(prisma, String(ctx.from?.id ?? ""), String(ctx.chat.id)), { reply_markup: menu });
  });
  bot.hears("Book", async (ctx) => {
    const reply = bookReply();
    await ctx.reply(reply.text, reply.markup ? { reply_markup: reply.markup } : { reply_markup: menu });
  });

  bot.callbackQuery(/^cancel:/, async (ctx) => {
    const token = ctx.callbackQuery.data.slice("cancel:".length);
    const booking = await prisma.booking.findUnique({ where: { manageToken: token }, include: { client: true } });
    if (!booking || booking.client.telegramChatId !== String(ctx.chat?.id ?? "")) {
      await ctx.answerCallbackQuery({ text: "This visit is not in this chat." });
      return;
    }
    try {
      await cancelBooking(prisma, token);
      await ctx.answerCallbackQuery({ text: "The visit is cancelled." });
    } catch (error) {
      await ctx.answerCallbackQuery({ text: error instanceof Error ? error.message : "The visit was not cancelled." });
    }
  });

  bot.callbackQuery(/^review:/, async (ctx) => {
    const [, bookingId, ratingRaw] = ctx.callbackQuery.data.split(":");
    const rating = Number(ratingRaw);
    if (!bookingId || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      await ctx.answerCallbackQuery({ text: "That rating is not valid." });
      return;
    }
    const booking = await prisma.booking.findUnique({ where: { id: bookingId }, include: { client: true } });
    if (!booking || booking.client.telegramChatId !== String(ctx.chat?.id ?? "")) {
      await ctx.answerCallbackQuery({ text: "This visit is not in this chat." });
      return;
    }
    const minimum = await prisma.setting.findUnique({ where: { key: "review_public_min_rating" } });
    const publicFrom = Number(minimum?.value ?? 4);
    await prisma.review.upsert({
      where: { bookingId },
      create: {
        bookingId,
        barberId: booking.barberId,
        clientId: booking.clientId,
        rating,
        isPublic: rating >= (Number.isFinite(publicFrom) ? publicFrom : 4),
      },
      update: {},
    });
    await ctx.answerCallbackQuery({ text: "Saved." });
  });

  bot.catch((error) => logTelegram(error.error ?? error));
  return bot;
}

export function telegramMode(env: { VERCEL?: string; TELEGRAM_WEBHOOK_URL?: string } = process.env) {
  if (env.VERCEL || env.TELEGRAM_WEBHOOK_URL) return "webhook" as const;
  return "polling" as const;
}

async function connectTelegram(bot: Bot) {
  try {
    const me = await bot.api.getMe();
    if (me.username) username = me.username;
    await bot.api.setMyCommands([
      { command: "start", description: "Open Orda" },
      { command: "visits", description: "Your visits" },
    ]);
    if (telegramMode() === "webhook") {
      const webhook = process.env.TELEGRAM_WEBHOOK_URL;
      if (!webhook) return;
      await bot.api.setWebhook(webhook, {
        secret_token: process.env.TELEGRAM_WEBHOOK_SECRET || undefined,
        allowed_updates: ["message", "callback_query"],
      });
      return;
    }
    await bot.api.deleteWebhook();
    running = bot;
    await bot.start();
  } catch (error) {
    logTelegram(error);
  }
}

export function registerTelegram(app: FastifyInstance, prisma: PrismaClient) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    app.post("/telegram/webhook", async (_request, reply) => {
      return reply.code(503).send({ code: "TELEGRAM_NOT_CONFIGURED", message: "Telegram bot token is not set" });
    });
    return;
  }

  const bot = createTelegramBot(token, prisma);
  app.post("/telegram/webhook", async (request, reply) => {
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!webhookAllowed(request.headers["x-telegram-bot-api-secret-token"], secret)) {
      return reply.code(401).send({ code: "TELEGRAM_AUTH", message: "Webhook secret is invalid" });
    }
    await bot.handleUpdate(request.body as Parameters<Bot["handleUpdate"]>[0]);
    return reply.send({ ok: true });
  });

  void connectTelegram(bot);
}
