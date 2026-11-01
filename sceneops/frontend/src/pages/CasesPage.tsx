import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FolderOpen, FolderPlus, Search } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useCases } from "@/lib/queries";
import { fmtDateTime } from "@/lib/format";
import { CASE_STATUS, PRIORITY } from "@/lib/labels";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox, Input, Select } from "@/components/ui/form";
import { EmptyState, ErrorState, Loading, PageHeader } from "@/components/ui/misc";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { CaseStatusBadge, PriorityBadge } from "@/components/StatusBadge";
import { CaseFormDialog } from "@/components/dialogs/CaseFormDialog";

export default function CasesPage() {
  const nav = useNavigate();
  const { can } = useAuth();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [sort, setSort] = useState("updated");
  const [archived, setArchived] = useState(false);
  const [open, setOpen] = useState(false);
  const cases = useCases({ q: q.trim() || undefined, status: status || undefined, priority: priority || undefined, sort,
    include_archived: archived ? "true" : undefined });

  return (
    <div>
      <PageHeader title="תיקים ומוצגים" subtitle="ניהול תיקי חקירה, מוצגים דיגיטליים ושרשרת משמורת" icon={<FolderOpen />}
        actions={can("investigator") && <Button onClick={() => setOpen(true)}><FolderPlus />פתח תיק חדש</Button>} />
      <Card className="p-4 mb-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr_1fr_auto] items-center">
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש לפי מספר תיק, כותרת או תיאור" className="ps-9"
              aria-label="חיפוש תיקים" />
          </div>
          <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="סינון לפי סטטוס">
            <option value="">כל הסטטוסים</option>
            {Object.entries(CASE_STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <Select value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="סינון לפי עדיפות">
            <option value="">כל העדיפויות</option>
            {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
          <Select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="מיון">
            <option value="updated">מיון: עודכן לאחרונה</option>
            <option value="opened">מיון: תאריך פתיחה</option>
            <option value="priority">מיון: עדיפות</option>
            <option value="reference">מיון: מספר תיק</option>
          </Select>
          <Checkbox checked={archived} onChange={setArchived} label="כולל ארכיון" />
        </div>
      </Card>
      <Card>
        {cases.isLoading ? <Loading /> : cases.isError ? <ErrorState error={cases.error} retry={() => cases.refetch()} /> :
          !cases.data?.length ? (
            <EmptyState title="לא נמצאו תיקים" description={q || status || priority ? "נסו לשנות את מסנני החיפוש." : "פתחו תיק חדש כדי להתחיל."}
              action={can("investigator") && <Button onClick={() => setOpen(true)}><FolderPlus />פתח תיק חדש</Button>} />
          ) : (
            <Table>
              <thead>
                <tr><Th>מספר תיק</Th><Th>כותרת</Th><Th>סטטוס</Th><Th>עדיפות</Th><Th>חוקר אחראי</Th><Th>מוצגים</Th>
                  <Th>קבצי מדיה</Th><Th>משימות פעילות</Th><Th>נפתח</Th></tr>
              </thead>
              <tbody>
                {cases.data.map((c) => (
                  <Tr key={c.id} className="cursor-pointer" onClick={() => nav(`/cases/${c.id}`)}
                    tabIndex={0} onKeyDown={(e) => e.key === "Enter" && nav(`/cases/${c.id}`)}>
                    <Td className="font-semibold whitespace-nowrap"><bdi dir="ltr">{c.reference}</bdi></Td>
                    <Td className="min-w-[220px]">{c.title}{c.is_demo && <span className="ms-2 text-[11px] text-warn">הדגמה</span>}</Td>
                    <Td><CaseStatusBadge status={c.status} /></Td>
                    <Td><PriorityBadge priority={c.priority} /></Td>
                    <Td className="whitespace-nowrap">{c.assigned_to?.full_name ?? "—"}</Td>
                    <Td className="tabular">{c.exhibit_count}</Td>
                    <Td className="tabular">{c.media_count}</Td>
                    <Td className="tabular">{c.active_jobs || "—"}</Td>
                    <Td className="whitespace-nowrap text-ink-2">{fmtDateTime(c.opened_at)}</Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
      </Card>
      <CaseFormDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}
