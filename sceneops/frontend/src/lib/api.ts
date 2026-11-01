/** לקוח API: מוסיף אסימון התחברות, מתרגם שגיאות לעברית ומטפל בפקיעת התחברות. */
const TOKEN_KEY = "sceneops.token";

export function getToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* אחסון חסום – ההתחברות תישמר בזיכרון בלבד */
  }
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

const STATUS_HE: Record<number, string> = {
  400: "בקשה לא תקינה",
  401: "נדרשת התחברות מחדש",
  403: "אין הרשאה לבצע פעולה זו",
  404: "הפריט לא נמצא",
  409: "הפעולה מתנגשת במצב הנוכחי",
  413: "הבקשה גדולה מדי",
  422: "שגיאת אימות נתונים",
  429: "יותר מדי בקשות – נסו שוב מאוחר יותר",
  500: "שגיאת שרת פנימית",
  501: "יכולת זו טרם זמינה",
};

export async function api<T = unknown>(path: string, opts: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers = new Headers(opts.headers);
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  let body = opts.body;
  if (opts.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(opts.json);
  }
  let res: Response;
  try {
    res = await fetch(path, { ...opts, headers, body });
  } catch {
    throw new ApiError(0, "אין תקשורת עם השרת. ודאו ששרת SceneOps AI פועל");
  }
  if (!res.ok) {
    let msg = STATUS_HE[res.status] ?? `שגיאה (${res.status})`;
    try {
      const data = await res.json();
      if (typeof data?.detail === "string") msg = data.detail;
    } catch {
      /* ללא גוף JSON */
    }
    if (res.status === 401 && path !== "/api/auth/login") onUnauthorized?.();
    throw new ApiError(res.status, msg);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** כתובת לקובץ מוגן (תמונה/וידאו/הורדה) – האסימון מועבר בפרמטר כי תגיות מדיה אינן שולחות כותרות. */
export function fileUrl(path: string): string {
  const t = getToken();
  const sep = path.includes("?") ? "&" : "?";
  return t ? `${path}${sep}token=${encodeURIComponent(t)}` : path;
}
