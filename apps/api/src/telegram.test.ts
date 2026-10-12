import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { ApiError } from "./errors.js";
import { verifyTelegramInitData } from "./telegram.js";

const token = "test-bot-token";

function sign(fields: Record<string, string>, botToken = token) {
  const dataCheck = Object.entries(fields)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  const hash = createHmac("sha256", secret).update(dataCheck).digest("hex");
  return new URLSearchParams({ ...fields, hash }).toString();
}

test("initData signature yields the Telegram user", () => {
  const now = Date.parse("2026-10-09T12:00:00Z");
  const initData = sign({
    auth_date: String(Math.floor(now / 1000)),
    query_id: "AAE",
    user: JSON.stringify({ id: 42, first_name: "Aziz", last_name: "Karimov" }),
  });
  const user = verifyTelegramInitData(initData, token, now);
  assert.equal(user.telegramId, "42");
  assert.equal(user.name, "Aziz Karimov");
});

test("a bad signature is rejected", () => {
  const now = Date.now();
  const initData = sign(
    {
      auth_date: String(Math.floor(now / 1000)),
      user: JSON.stringify({ id: 7, first_name: "Leo" }),
    },
    "other-token",
  );
  assert.throws(() => verifyTelegramInitData(initData, token, now), (error: unknown) => {
    return error instanceof ApiError && error.code === "TELEGRAM_AUTH";
  });
});

test("an expired initData is rejected", () => {
  const now = Date.parse("2026-10-09T12:00:00Z");
  const initData = sign({
    auth_date: String(Math.floor(now / 1000) - 60 * 60 * 25),
    user: JSON.stringify({ id: 7, first_name: "Leo" }),
  });
  assert.throws(() => verifyTelegramInitData(initData, token, now), (error: unknown) => {
    return error instanceof ApiError && error.statusCode === 401;
  });
});
