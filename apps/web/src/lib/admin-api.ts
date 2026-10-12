const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class AdminError extends Error {
  constructor(message: string) {
    super(message);
  }
}

export async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has("content-type")) headers.set("content-type", "application/json");
  const response = await fetch(`${API}${path}`, { ...init, headers, credentials: "include" });
  const data = (await response.json().catch(() => ({}))) as { message?: string };
  if (response.status === 401 && !path.endsWith("/login")) {
    window.dispatchEvent(new Event("orda-admin-unauthorized"));
  }
  if (!response.ok) throw new AdminError(data.message ?? "Request failed");
  return data as T;
}

export async function uploadPhoto(file: File) {
  const body = new FormData();
  body.append("file", file);
  return adminFetch<{ url: string }>("/api/v1/admin/uploads", { method: "POST", body });
}
