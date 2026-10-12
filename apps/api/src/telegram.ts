import { createHmac, timingSafeEqual } from "node:crypto";
import { ApiError } from "./errors.js";

export type TelegramUser = {
  telegramId: string;
  name: string;
};

const MAX_AGE_SEC = 60 * 60 * 24;

export function verifyTelegramInitData(initData: string, botToken: string, now = Date.now()): TelegramUser {
  const params = new URLSearchParams(initData);
  const hash = params.get("hash") ?? "";
  if (!/^[0-9a-f]{64}$/i.test(hash)) {
    throw new ApiError(401, "TELEGRAM_AUTH", "Telegram signature is invalid");
  }
  params.delete("hash");

  const dataCheck = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const calculated = createHmac("sha256", secret).update(dataCheck).digest("hex");
  const left = Buffer.from(calculated, "hex");
  const right = Buffer.from(hash, "hex");
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    throw new ApiError(401, "TELEGRAM_AUTH", "Telegram signature is invalid");
  }

  const authDate = Number(params.get("auth_date"));
  if (!Number.isFinite(authDate) || now / 1000 - authDate > MAX_AGE_SEC) {
    throw new ApiError(401, "TELEGRAM_AUTH", "Telegram session expired");
  }

  const userRaw = params.get("user");
  if (!userRaw) throw new ApiError(401, "TELEGRAM_AUTH", "Telegram user is missing");
  let user: { id?: number; first_name?: string; last_name?: string; username?: string };
  try {
    user = JSON.parse(userRaw) as { id?: number; first_name?: string; last_name?: string; username?: string };
  } catch {
    throw new ApiError(401, "TELEGRAM_AUTH", "Telegram user is missing");
  }
  if (!user.id) throw new ApiError(401, "TELEGRAM_AUTH", "Telegram user is missing");

  const name = [user.first_name, user.last_name].filter(Boolean).join(" ").trim() || user.username || "Guest";
  return { telegramId: String(user.id), name };
}
