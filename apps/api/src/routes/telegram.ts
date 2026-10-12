import type { PrismaClient } from "@prisma/client";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { z } from "zod";
import { listTelegramBookings } from "../bookings.js";
import { ApiError } from "../errors.js";
import { verifyTelegramInitData, type TelegramUser } from "../telegram.js";

type Options = { prisma: PrismaClient };

const sessionBody = z.object({
  initData: z.string().min(1),
});

export function telegramUserFrom(request: FastifyRequest): TelegramUser | null {
  const raw = request.headers["x-telegram-init-data"];
  if (typeof raw !== "string" || raw.length === 0) return null;
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new ApiError(503, "TELEGRAM_NOT_CONFIGURED", "Telegram bot token is not set");
  return verifyTelegramInitData(raw, token);
}

async function upsertClient(prisma: PrismaClient, user: TelegramUser) {
  const existing = await prisma.client.findUnique({ where: { telegramId: user.telegramId } });
  if (existing) {
    if (!existing.telegramChatId) {
      return prisma.client.update({
        where: { id: existing.id },
        data: { telegramChatId: user.telegramId },
      });
    }
    return existing;
  }
  try {
    return await prisma.client.create({
      data: { name: user.name, phone: "", telegramId: user.telegramId, telegramChatId: user.telegramId },
    });
  } catch (error) {
    const again = await prisma.client.findUnique({ where: { telegramId: user.telegramId } });
    if (again) return again;
    throw error;
  }
}

export const telegramRoutes: FastifyPluginAsync<Options> = async (app, options) => {
  app.post("/api/v1/telegram/session", async (request) => {
    const body = sessionBody.parse(request.body);
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new ApiError(503, "TELEGRAM_NOT_CONFIGURED", "Telegram bot token is not set");
    const user = verifyTelegramInitData(body.initData, token);
    const client = await upsertClient(options.prisma, user);
    return {
      client: { id: client.id, name: client.name },
      telegramId: user.telegramId,
    };
  });

  app.get("/api/v1/telegram/bookings", async (request) => {
    const user = telegramUserFrom(request);
    if (!user) throw new ApiError(401, "TELEGRAM_AUTH", "Telegram session is missing");
    const bookings = await listTelegramBookings(options.prisma, user.telegramId);
    return { bookings };
  });
};
