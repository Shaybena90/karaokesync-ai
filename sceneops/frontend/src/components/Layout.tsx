import { useEffect, useState, type ReactNode } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Bell, ChevronDown, Cctv, Database, FileText, Film, FolderOpen, HardDrive, Home, Layers, LaptopMinimal, LogOut,
  Menu, Monitor, Settings, ShieldCheck, Workflow, X, CheckCircle2, AlertTriangle, User as UserIcon,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useLiveEvents } from "@/lib/events";
import { fmtBytes } from "@/lib/format";
import type { Health } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Dropdown } from "./ui/dropdown";
import { Emblem } from "./Emblem";

const NAV = [
  { to: "/", label: "מרכז שליטה", icon: Home, end: true },
  { to: "/cases", label: "תיקים ומוצגים", icon: FolderOpen },
  { to: "/cameras", label: "מצלמות (DVR/NVR)", icon: Cctv },
  { to: "/media", label: "מעבדת מדיה", icon: Film },
  { to: "/automation", label: "אוטומציות ומשימות", icon: Layers },
  { to: "/reports", label: "דוחות ותיעוד", icon: FileText },
  { to: "/remote", label: "שליטה מרחוק", icon: Monitor },
  { to: "/notifications", label: "התראות", icon: Bell, badge: true },
  { to: "/settings", label: "הגדרות מערכת", icon: Settings },
];

function useHealth() {
  return useQuery({ queryKey: ["health"], queryFn: () => api<Health>("/api/system/health"), refetchInterval: 10000 });
}

function useUnread() {
  return useQuery({
    queryKey: ["unread"], queryFn: () => api<{ unread: number }>("/api/notifications/unread-count"),
    refetchInterval: 30000,
  });
}

function HealthPanel() {
  const { data: h } = useHealth();
  const allOk = !!h && h.worker_ok && h.db_ok;
  const Row = ({ icon, children }: { icon: ReactNode; children: ReactNode }) => (
    <div className="flex items-center gap-2.5 text-[13px] text-ink-2">
      <span className="text-ink-3 [&_svg]:size-4">{icon}</span>{children}
    </div>
  );
  return (
    <div className="rounded-xl border border-line/70 bg-[#0d1b2e]/80 p-3 space-y-2.5" aria-live="polite">
      <div className={cn("flex items-center justify-between rounded-lg border px-3 py-2.5 font-bold",
        allOk ? "border-ok/60 bg-ok/10 text-ink shadow-glow-ok" : "border-warn/60 bg-warn/10 text-ink")}>
        <span>{!h ? "בודק מצב…" : allOk ? "מערכת פעילה" : "נדרשת תשומת לב"}</span>
        {allOk ? <CheckCircle2 className="size-5 text-ok" /> : <AlertTriangle className="size-5 text-warn" />}
      </div>
      <div className="space-y-2 px-1">
        <Row icon={<Workflow />}>מנוע המשימות: <b className={h?.worker_ok ? "text-ok font-medium" : "text-warn font-medium"}>
          {h ? (h.worker_ok ? "פעיל" : "לא פעיל") : "…"}</b></Row>
        <Row icon={<Database />}>מסד הנתונים: <b className={h?.db_ok ? "text-ok font-medium" : "text-danger font-medium"}>
          {h ? (h.db_ok ? "מחובר" : "מנותק") : "…"}</b></Row>
        <Row icon={<HardDrive />}>שטח אחסון פנוי: <b className="font-medium text-ink"><bdi dir="ltr">
          {h ? `${fmtBytes(h.storage_free)} (${Math.round(h.storage_free_pct)}%)` : "…"}</bdi></b></Row>
      </div>
    </div>
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const { data: unread } = useUnread();
  return (
    <nav aria-label="ניווט ראשי" className="flex h-full flex-col gap-4 px-3 py-5">
      <ul className="space-y-1.5">
        {NAV.map((n) => (
          <li key={n.to}>
            <NavLink to={n.to} end={n.end} onClick={onNavigate}
              className={({ isActive }) => cn(
                "group flex items-center gap-3 rounded-xl px-4 py-3 text-[15.5px] font-medium transition-all",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                isActive ? "bg-accent text-white shadow-[0_0_24px_-4px_rgba(49,155,255,0.8)]" : "text-ink hover:bg-white/5")}>
              <n.icon className="size-[22px] shrink-0" aria-hidden />
              <span className="flex-1">{n.label}</span>
              {n.badge && !!unread?.unread && (
                <span className="grid min-w-6 h-6 place-items-center rounded-full bg-danger px-1.5 text-xs font-bold text-white"
                  aria-label={`${unread.unread} התראות שלא נקראו`}>{unread.unread}</span>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
      <div className="mt-auto"><HealthPanel /></div>
    </nav>
  );
}

function Header({ onMenu }: { onMenu: () => void }) {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const { data: h } = useHealth();
  const { data: unread } = useUnread();
  const remoteActive = h?.remote_mode === "local_simulation";
  return (
    <header className="sticky top-0 z-30 flex h-[70px] items-center gap-3 border-b border-line/70 bg-[#0a1729]/95 px-3 md:px-5 backdrop-blur">
      <button className="lg:hidden rounded-lg p-2 text-ink-2 hover:bg-white/5" onClick={onMenu} aria-label="פתיחת תפריט">
        <Menu className="size-6" />
      </button>
      {/* מותג – בצד ימין */}
      <div className="flex items-center gap-3 shrink-0">
        <Emblem className="size-12 md:size-14 shrink-0" />
        <div className="leading-tight">
          <div className="text-[22px] md:text-[28px] font-extrabold tracking-tight text-ink" dir="ltr">SceneOps AI</div>
          <div className="hidden sm:block whitespace-nowrap text-[13px] md:text-[15px] text-ink-2">מערכת לניהול חקירות מדיה ומצלמות</div>
        </div>
      </div>
      <div className="flex-1" />
      {/* צד שמאל: חיבור מרחוק, התראות, משתמש */}
      <div className="flex items-center gap-1 md:gap-3">
        <button onClick={() => nav("/remote")} className="hidden md:flex items-center gap-3 rounded-lg px-3 py-1.5 hover:bg-white/5"
          aria-label="מצב חיבור מרחוק">
          <div className="text-start leading-tight">
            <div className="flex items-center gap-1.5 text-sm text-ink">חיבור מרחוק
              <span className={cn("size-2 rounded-full", remoteActive ? "bg-ok shadow-[0_0_8px_#20C997]" : "bg-ink-3")} /></div>
            <div className={cn("text-sm", remoteActive ? "text-ok" : "text-ink-3")}>
              {remoteActive ? (h && h.agents_online > 0 ? "פעיל" : "סימולציה מקומית") : "מושבת"}</div>
          </div>
          <LaptopMinimal className="size-7 text-ink-2" />
        </button>
        <div className="hidden md:block h-9 w-px bg-line" />
        <button onClick={() => nav("/notifications")} className="relative rounded-full p-2.5 hover:bg-white/5"
          aria-label={`התראות${unread?.unread ? ` (${unread.unread} חדשות)` : ""}`}>
          <Bell className="size-6 text-ink-2" />
          {!!unread?.unread && (
            <span className="absolute -top-0.5 -end-0.5 grid size-5 place-items-center rounded-full bg-danger text-[11px] font-bold text-white">
              {unread.unread > 9 ? "9+" : unread.unread}</span>
          )}
        </button>
        <div className="hidden md:block h-9 w-px bg-line" />
        <Dropdown
          trigger={
            <button className="flex items-center gap-2.5 rounded-lg px-2 py-1 hover:bg-white/5" aria-label="תפריט משתמש">
              <ChevronDown className="size-4 text-ink-3 hidden sm:block" />
              <div className="hidden sm:block text-start leading-tight">
                <div className="font-bold text-ink">{user?.full_name}</div>
                <div className="text-sm text-ink-2">{user?.role_label}</div>
              </div>
              <span className="grid size-11 place-items-center rounded-full border-2 border-accent/70 bg-accent/15 text-accent">
                <UserIcon className="size-6" />
              </span>
            </button>
          }
          items={[
            { label: "הגדרות מערכת", icon: <Settings className="size-4" />, onSelect: () => nav("/settings") },
            { label: "יומן ביקורת", icon: <ShieldCheck className="size-4" />, onSelect: () => nav("/settings?tab=audit") },
            { label: "התנתקות", icon: <LogOut className="size-4" />, danger: true, onSelect: () => void logout() },
          ]}
        />
      </div>
    </header>
  );
}

export function Layout() {
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  const { user } = useAuth();
  useLiveEvents(!!user);
  useEffect(() => setOpen(false), [loc.pathname]);
  return (
    <div className="min-h-screen bg-bg text-ink">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:start-2 focus:z-50 focus:rounded focus:bg-accent focus:px-3 focus:py-2">
        דילוג לתוכן הראשי</a>
      <Header onMenu={() => setOpen(true)} />
      <div className="flex">
        <aside className="hidden lg:block fixed top-[70px] bottom-0 start-0 w-[268px] border-e border-line/60 bg-sidebar overflow-y-auto">
          <Sidebar />
        </aside>
        {open && (
          <div className="lg:hidden fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="תפריט ניווט">
            <div className="absolute inset-0 bg-black/60" onClick={() => setOpen(false)} />
            <aside className="absolute top-0 bottom-0 start-0 w-[280px] max-w-[85vw] bg-sidebar border-e border-line overflow-y-auto">
              <div className="flex justify-end p-2">
                <button onClick={() => setOpen(false)} className="rounded-lg p-2 hover:bg-white/5" aria-label="סגירת תפריט"><X /></button>
              </div>
              <Sidebar onNavigate={() => setOpen(false)} />
            </aside>
          </div>
        )}
        <main id="main" className="flex-1 min-w-0 lg:ms-[268px] px-3 py-5 md:px-6 md:py-6 xl:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
