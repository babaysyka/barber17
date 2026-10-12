const API = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export class ApiFailure extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit, initData?: string): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body) headers.set("content-type", "application/json");
  if (initData) headers.set("x-telegram-init-data", initData);
  const response = await fetch(`${API}${path}`, { ...init, headers });
  const body = (await response.json().catch(() => ({}))) as { code?: string; message?: string };
  if (!response.ok) {
    throw new ApiFailure(response.status, body.code ?? "INTERNAL", body.message ?? "The request failed.");
  }
  return body as T;
}
