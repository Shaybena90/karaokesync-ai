import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { LogIn, ShieldAlert } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/form";
import { Emblem } from "@/components/Emblem";

export default function LoginPage() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const demo = useQuery({
    queryKey: ["demo-users"],
    queryFn: () => api<{ username: string; full_name: string; role_label: string }[]>("/api/auth/demo-users"),
  });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!username.trim() || !password) {
      setError("יש להזין שם משתמש וסיסמה");
      return;
    }
    setBusy(true);
    try {
      await login(username.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ההתחברות נכשלה");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <Emblem className="size-20" />
          <h1 className="text-4xl font-extrabold" dir="ltr">SceneOps AI</h1>
          <p className="text-ink-2">מערכת לניהול חקירות מדיה ומצלמות</p>
        </div>
        <form onSubmit={submit} className="rounded-2xl border border-line bg-card/80 p-6 shadow-card space-y-4" noValidate>
          <h2 className="text-xl font-bold">התחברות</h2>
          <Field label="שם משתמש" required>
            <Input autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} dir="ltr"
              className="text-start" placeholder="לדוגמה: admin" />
          </Field>
          <Field label="סיסמה" required error={error}>
            <Input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)}
              dir="ltr" className="text-start" placeholder="••••••••" />
          </Field>
          <Button type="submit" className="w-full" size="lg" loading={busy}><LogIn />כניסה למערכת</Button>
        </form>
        {!!demo.data?.length && (
          <div className="mt-5 rounded-xl border border-warn/40 bg-warn/5 p-4 text-sm">
            <p className="flex items-center gap-2 font-semibold text-warn"><ShieldAlert className="size-4" />מצב הדגמה – משתמשים בדויים</p>
            <p className="mt-1 text-ink-3">ההתחברות כאן מיועדת להדגמה מקומית בלבד ואינה מנגנון אבטחה לייצור. הסיסמאות מתועדות ב-README.</p>
            <ul className="mt-3 grid gap-1.5">
              {demo.data.map((u) => (
                <li key={u.username}>
                  <button type="button" onClick={() => setUsername(u.username)}
                    className="flex w-full items-center justify-between rounded-lg border border-line/60 px-3 py-2 hover:border-accent/60">
                    <span>{u.full_name} <span className="text-ink-3">· {u.role_label}</span></span>
                    <bdi dir="ltr" className="font-mono text-ink-2">{u.username}</bdi>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
