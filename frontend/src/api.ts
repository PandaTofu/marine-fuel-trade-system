let csrfToken = "";
export class ApiError extends Error {
  constructor(
    public code: string,
    public status: number,
    public fields?: unknown,
  ) {
    super(`errors.${code}`);
  }
}
export async function api<T = unknown>(
  path: string,
  method = "GET",
  data?: unknown,
): Promise<T> {
  try {
    if (method !== "GET" && !csrfToken) {
      const r = await fetch("/api/auth/csrf/", { credentials: "same-origin" });
      csrfToken = (await r.json()).csrfToken;
    }
    const res = await fetch(`/api/${path}`, {
      method,
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        ...(method !== "GET" ? { "X-CSRFToken": csrfToken } : {}),
      },
      ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
    });
    const body = await res.json().catch(() => ({ code: "server_error" }));
    if (!res.ok) {
      if (["session_expired", "not_authenticated"].includes(body.code))
        window.dispatchEvent(new Event("session-ended"));
      throw new ApiError(body.code || "server_error", res.status, body.fields);
    }
    if (["auth/login/", "auth/password/", "auth/logout/"].includes(path))
      csrfToken = "";
    return body;
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw new Error("networkError");
  }
}
export interface User {
  id: number;
  username: string;
  first_name: string;
  role: "admin" | "operator";
  language: "zh-CN" | "en";
  is_active: boolean;
  must_change_password: boolean;
}
export interface Reference {
  id: number;
  kind: string;
  code: string | null;
  name: string;
  is_active: boolean;
}
