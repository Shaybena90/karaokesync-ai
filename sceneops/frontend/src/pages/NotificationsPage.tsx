import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Bell, CheckCheck, CheckCircle2, Info, XCircle } from "lucide-react";
import { api } from "@/lib/api";
import { useAction } from "@/lib/queries";
import { fmtDateTime } from "@/lib/format";
import type { Notification } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/form";
import { EmptyState, ErrorState, Loading, PageHeader } from "@/components/ui/misc";

const ICON = {
  success: <CheckCircle2 className="text-ok" />, warning: <AlertTriangle className="text-warn" />,
  error: <XCircle className="text-danger" />, info: <Info className="text-accent" />,
};

export default function NotificationsPage() {
  const [unread, setUnread] = useState(false);
  const q = useQuery({ queryKey: ["notifications", unread], queryFn: () => api<Notification[]>(`/api/notifications${unread ? "?unread_only=true" : ""}`) });
  const markAll = useAction(() => api("/api/notifications/read-all", { method: "POST" }), { success: "כל ההתראות סומנו כנקראו", invalidate: [["notifications"], ["unread"]] });
  const mark = useAction((id: number) => api(`/api/notifications/${id}/read`, { method: "POST" }), { invalidate: [["notifications"], ["unread"]] });
  return (
    <div className="space-y-5">
      <PageHeader title="התראות" icon={<Bell />} subtitle="עדכוני משימות, כשלים ואירועי מערכת"
        actions={<Button variant="secondary" onClick={() => markAll.mutate(undefined)} loading={markAll.isPending}><CheckCheck />סימון הכל כנקרא</Button>} />
      <Checkbox checked={unread} onChange={setUnread} label="הצגת התראות שלא נקראו בלבד" />
      <Card>
        {q.isLoading ? <Loading /> : q.isError ? <ErrorState error={q.error} /> : !q.data?.length ? <EmptyState icon={<Bell />} title="אין התראות" /> : (
          <ul className="divide-y divide-line/50">
            {q.data.map((n) => (
              <li key={n.id} className={cn("flex items-start gap-3 px-5 py-4", !n.read && "bg-accent/[0.04]")}>
                <span className="mt-0.5 [&_svg]:size-5">{ICON[n.level]}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("font-medium", !n.read && "text-ink")}>{n.title}</span>
                    {!n.read && <span className="size-2 rounded-full bg-accent" aria-label="לא נקראה" />}
                  </div>
                  {n.body && <p className="mt-0.5 text-sm text-ink-2">{n.body}</p>}
                  <div className="mt-1 flex gap-3 text-xs text-ink-3">
                    <span>{fmtDateTime(n.created_at)}</span>
                    {n.link && <Link to={n.link} onClick={() => !n.read && mark.mutate(n.id)} className="text-accent hover:underline">פתיחה</Link>}
                  </div>
                </div>
                {!n.read && <Button size="sm" variant="ghost" onClick={() => mark.mutate(n.id)}>סימון כנקרא</Button>}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
