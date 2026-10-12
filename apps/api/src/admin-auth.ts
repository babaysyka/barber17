import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { FastifyRequest } from "fastify";
import { argon2Verify, argon2id } from "hash-wasm";
import { ApiError } from "./errors.js";

const COOKIE = "orda_admin";
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 8;
const attempts = new Map<string, number[]>();

export async function hashPassword(password: string) {
  return argon2id({
    password,
    salt: randomBytes(16),
    parallelism: 1,
    iterations: 2,
    memorySize: 19456,
    hashLength: 32,
    outputType: "encoded",
  });
}

function verifyScrypt(password: string, stored: string) {
  const [, salt, hash] = stored.split("$");
  if (!salt || !hash) return false;
  const actual = Buffer.from(hash, "hex");
  const expected = scryptSync(password, salt, actual.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function verifyPassword(password: string, stored: string) {
  if (stored.startsWith("scrypt$")) return verifyScrypt(password, stored);
  if (stored.startsWith("$argon2")) return argon2Verify({ password, hash: stored });
  return false;
}

export function assertLoginAllowed(key: string, now = Date.now()) {
  const recent = (attempts.get(key) ?? []).filter((time) => now - time < WINDOW_MS);
  if (recent.length >= MAX_ATTEMPTS) {
    throw new ApiError(429, "RATE_LIMIT", "Too many sign-in attempts. Wait a few minutes.");
  }
  recent.push(now);
  attempts.set(key, recent);
}

export function resetLoginAttempts() {
  attempts.clear();
}

function secret() {
  const value = process.env.ADMIN_SESSION_SECRET;
  if (!value) throw new ApiError(503, "ADMIN_AUTH", "Admin session secret is not set");
  return value;
}

export function signSession(adminId: string, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ id: adminId, exp: now + 7 * 86400000 })).toString("base64url");
  const signature = createHmac("sha256", secret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function readSession(token: string, now = Date.now()) {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = createHmac("sha256", secret()).update(payload).digest("base64url");
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { id?: string; exp?: number };
  if (!data.id || !data.exp || data.exp <= now) return null;
  return { id: data.id };
}

export function sessionCookie(token: string, clear = false) {
  const onVercel = process.env.VERCEL === "1";
  return [
    `${COOKIE}=${clear ? "" : token}`,
    "HttpOnly",
    "Path=/",
    onVercel ? "SameSite=None" : "SameSite=Lax",
    onVercel ? "Secure" : "",
    clear ? "Max-Age=0" : "Max-Age=604800",
  ]
    .filter(Boolean)
    .join("; ");
}

function cookieValue(header: string | undefined) {
  for (const part of header?.split(";") ?? []) {
    const [name, ...rest] = part.trim().split("=");
    if (name === COOKIE) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function requireAdmin(request: FastifyRequest) {
  const token = cookieValue(request.headers.cookie);
  const session = token ? readSession(token) : null;
  if (!session) throw new ApiError(401, "ADMIN_AUTH", "Sign in required");
  return session.id;
}
