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

export async function uploadApi<T>(path: string, data: FormData): Promise<T> {
  if (!csrfToken) {
    const response = await fetch("/api/auth/csrf/", { credentials: "same-origin" });
    csrfToken = (await response.json()).csrfToken;
  }
  try {
    const response = await fetch(`/api/${path}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "X-CSRFToken": csrfToken },
      body: data,
    });
    const body = await response.json().catch(() => ({ code: "server_error" }));
    if (!response.ok) throw new ApiError(body.code || "server_error", response.status, body.fields);
    return body;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new Error("networkError");
  }
}
export interface User {
  id: number;
  username: string;
  first_name: string;
  role: "admin" | "operator" | "finance";
  language: "zh-CN" | "en";
  is_active: boolean;
  must_change_password: boolean;
}
export interface Reference {
  id: number;
  kind: string;
  code: string | null;
  name: string;
  email: string;
  swift_code: string;
  iban: string;
  bank_code: string;
  bank_address: string;
  oil_category: string;
  specification: string;
  unit: string;
  reference_sale_price: string | null;
  reference_cost_price: string | null;
  note: string;
  is_active: boolean;
}
