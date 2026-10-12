import assert from "node:assert/strict";
import { scryptSync } from "node:crypto";
import test from "node:test";
import { assertLoginAllowed, hashPassword, readSession, resetLoginAttempts, signSession, verifyPassword } from "./admin-auth.js";

test("argon2 hash verifies and the seeded scrypt hash still matches", async () => {
  const stored = await hashPassword("orda-local");
  assert.equal(stored.startsWith("$argon2id$"), true);
  assert.equal(await verifyPassword("orda-local", stored), true);
  assert.equal(await verifyPassword("wrong", stored), false);
  const seeded = `scrypt$orda-local-seed$${scryptSync("orda-local", "orda-local-seed", 64).toString("hex")}`;
  assert.equal(await verifyPassword("orda-local", seeded), true);
});

test("session cookie payload rejects a tampered signature", () => {
  process.env.ADMIN_SESSION_SECRET = "test-secret";
  const token = signSession("admin-1", 1_700_000_000_000);
  assert.equal(readSession(token, 1_700_000_000_000)?.id, "admin-1");
  const [payload] = token.split(".");
  assert.equal(readSession(`${payload}.tampered`, 1_700_000_000_000), null);
  assert.equal(readSession(token, 1_700_000_000_000 + 8 * 86400000), null);
});

test("login rate limit stops after eight attempts", () => {
  resetLoginAttempts();
  for (let index = 0; index < 8; index += 1) assertLoginAllowed("127.0.0.1", 1_000);
  assert.throws(() => assertLoginAllowed("127.0.0.1", 1_000), /Too many sign-in attempts/);
  assertLoginAllowed("127.0.0.1", 1_000 + 11 * 60 * 1000);
});
