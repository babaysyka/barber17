import type { PrismaClient } from "@prisma/client";
import type { FastifyPluginAsync } from "fastify";
import { InlineKeyboard } from "grammy";
import { createPrismaStore, runReminders } from "../reminders.js";
import { sendTelegram } from "../telegram-bot.js";

type Options = { prisma: PrismaClient };

function reviewKeyboard(bookingId: string) {
  const keyboard = new InlineKeyboard();
  for (let rating = 1; rating <= 5; rating += 1) {
    keyboard.text(String(rating), `review:${bookingId}:${rating}`);
  }
  return keyboard;
}

export const notificationRoutes: FastifyPluginAsync<Options> = async (app, options) => {
  app.post("/internal/notifications", async (request, reply) => {
    const secret = process.env.CRON_SECRET;
    const header = request.headers["x-cron-secret"];
    if (!secret || header !== secret) {
      return reply.code(401).send({ code: "CRON_AUTH", message: "Cron secret is invalid" });
    }
    const result = await runReminders(createPrismaStore(options.prisma), (action) => {
      const markup = action.type === "review" ? reviewKeyboard(action.id) : undefined;
      return sendTelegram(action.chatId, action.text, markup);
    });
    return result;
  });
};
