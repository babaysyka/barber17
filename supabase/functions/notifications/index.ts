import { planReminders, type ReminderAction, type ReminderRow, type ReminderSettings } from "../../../apps/api/src/reminder-rules.ts";

type BookingRecord = {
  id: string;
  status: string;
  starts_at: string;
  ends_at: string;
  reminder_day_sent_at: string | null;
  reminder_30m_sent_at: string | null;
  review_requested_at: string | null;
  clients: { name: string; telegram_chat_id: string | null } | { name: string; telegram_chat_id: string | null }[];
  barbers: { name: string } | { name: string }[];
  booking_services: { name: string }[];
};

function settingsFrom(rows: { key: string; value: string }[]): ReminderSettings {
  const map = new Map(rows.map((row) => [row.key, Number(row.value)]));
  const read = (key: string, fallback: number) => {
    const value = map.get(key);
    return value && Number.isFinite(value) && value > 0 ? value : fallback;
  };
  return {
    dayMinutes: read("reminder_day_minutes", 1440),
    shortMinutes: read("reminder_short_minutes", 30),
    reviewDelayMin: read("review_delay_min", 60),
  };
}

function one<T>(value: T | T[]): T {
  return Array.isArray(value) ? value[0] : value;
}

function toRow(record: BookingRecord): ReminderRow {
  const client = one(record.clients);
  const barber = one(record.barbers);
  return {
    id: record.id,
    status: record.status,
    startsAt: record.starts_at,
    endsAt: record.ends_at,
    reminderDaySentAt: record.reminder_day_sent_at,
    reminder30mSentAt: record.reminder_30m_sent_at,
    reviewRequestedAt: record.review_requested_at,
    chatId: client.telegram_chat_id,
    clientName: client.name,
    barberName: barber.name,
    services: record.booking_services.map((service) => service.name).join(", "),
  };
}

async function rest<T>(path: string, init?: RequestInit): Promise<T> {
  const base = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!base || !key) throw new Error("Supabase service role is not configured");
  const response = await fetch(`${base}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
      prefer: "return=representation",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) throw new Error(`Supabase ${response.status}`);
  return (await response.json()) as T;
}

async function claim(action: ReminderAction, now: string) {
  const filter =
    action.type === "complete"
      ? `id=eq.${action.id}&status=eq.confirmed&auto_completed_at=is.null`
      : action.type === "day"
        ? `id=eq.${action.id}&status=eq.confirmed&reminder_day_sent_at=is.null`
        : action.type === "short"
          ? `id=eq.${action.id}&status=eq.confirmed&reminder_30m_sent_at=is.null`
          : `id=eq.${action.id}&status=eq.completed&review_requested_at=is.null`;
  const body =
    action.type === "complete"
      ? { status: "completed", auto_completed_at: now }
      : action.type === "day"
        ? { reminder_day_sent_at: now }
        : action.type === "short"
          ? { reminder_30m_sent_at: now }
          : { review_requested_at: now };
  const rows = await rest<unknown[]>(`bookings?${filter}`, { method: "PATCH", body: JSON.stringify(body) });
  return rows.length === 1;
}

async function release(action: ReminderAction) {
  const body =
    action.type === "day"
      ? { reminder_day_sent_at: null }
      : action.type === "short"
        ? { reminder_30m_sent_at: null }
        : { review_requested_at: null };
  await rest(`bookings?id=eq.${action.id}`, { method: "PATCH", body: JSON.stringify(body) });
}

async function send(token: string, action: Exclude<ReminderAction, { type: "complete" }>) {
  const replyMarkup =
    action.type === "review"
      ? {
          inline_keyboard: [
            [1, 2, 3, 4, 5].map((rating) => ({ text: String(rating), callback_data: `review:${action.id}:${rating}` })),
          ],
        }
      : undefined;
  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: action.chatId, text: action.text, reply_markup: replyMarkup }),
  });
  return response.ok;
}

Deno.serve(async (request) => {
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret || request.headers.get("x-cron-secret") !== secret) {
    return new Response(JSON.stringify({ code: "CRON_AUTH" }), { status: 401 });
  }
  const token = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!token) return new Response(JSON.stringify({ code: "TELEGRAM_NOT_CONFIGURED" }), { status: 503 });

  const now = new Date();
  const horizon = new Date(now.getTime() + 26 * 60 * 60 * 1000).toISOString();
  const past = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const settingsRows = await rest<{ key: string; value: string }[]>(
    "settings?select=key,value&key=in.(reminder_day_minutes,reminder_short_minutes,review_delay_min)",
  );
  const select =
    "id,status,starts_at,ends_at,reminder_day_sent_at,reminder_30m_sent_at,review_requested_at,clients!bookings_client_id_fkey(name,telegram_chat_id),barbers!bookings_barber_id_fkey(name),booking_services(name)";
  const confirmed = await rest<BookingRecord[]>(
    `bookings?select=${encodeURIComponent(select)}&status=eq.confirmed&starts_at=lte.${horizon}&ends_at=gte.${past}`,
  );
  const finished = await rest<BookingRecord[]>(
    `bookings?select=${encodeURIComponent(select)}&status=eq.completed&review_requested_at=is.null&ends_at=gte.${past}`,
  );
  const actions = planReminders([...confirmed, ...finished].map(toRow), now, settingsFrom(settingsRows));
  const sent: string[] = [];
  const completed: string[] = [];
  for (const action of actions) {
    if (!(await claim(action, now.toISOString()))) continue;
    if (action.type === "complete") {
      completed.push(action.id);
      continue;
    }
    const ok = token ? await send(token, action) : false;
    if (!ok) {
      await release(action);
      continue;
    }
    sent.push(`${action.type}:${action.id}`);
  }
  return new Response(JSON.stringify({ sent, completed }), { headers: { "content-type": "application/json" } });
});
