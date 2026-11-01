import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { FileText, Info } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fmtDateTime } from "@/lib/format";
import type { Report } from "@/lib/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, Loading, PageHeader } from "@/components/ui/misc";
import { Table, Td, Th, Tr } from "@/components/ui/table";
import { ReportStatusBadge } from "@/components/StatusBadge";
import { StartWorkflowDialog } from "@/components/dialogs/StartWorkflowDialog";

export default function ReportsPage() {
  const { can } = useAuth();
  const [open, setOpen] = useState(false);
  const q = useQuery({ queryKey: ["reports"], queryFn: () => api<Report[]>("/api/reports") });
  return (
    <div className="space-y-5">
      <PageHeader title="דוחות ותיעוד" icon={<FileText />} subtitle="דוחות PDF ו-DOCX בעברית מנתוני התיק השמורים, עם גרסאות ואישורים"
        actions={can("investigator") && <Button onClick={() => setOpen(true)}><FileText />הפקת דוח</Button>} />
      <div className="flex gap-3 rounded-xl border border-warn/40 bg-warn/5 p-4 text-sm text-ink-2">
        <Info className="size-5 shrink-0 text-warn" />
        <p>כל דוח הוא <b>טיוטה</b> עד שחוקר מורשה (שאינו מפיק הגרסה) או מנהל בודק ומאשר אותו. הדוחות מבוססים אך ורק על נתונים שנשמרו במערכת, ואינם מהווים אישור קבילות ראייתית או הסמכה פורנזית.</p>
      </div>
      <Card>
        {q.isLoading ? <Loading /> : q.isError ? <ErrorState error={q.error} /> : !q.data?.length ? (
          <EmptyState icon={<FileText />} title="טרם הופקו דוחות" action={can("investigator") && <Button onClick={() => setOpen(true)}>הפקת דוח</Button>} />
        ) : (
          <Table>
            <thead><tr><Th>#</Th><Th>תיק</Th><Th>כותרת</Th><Th>סטטוס</Th><Th>גרסה נוכחית</Th><Th>אושר</Th><Th>עודכן</Th></tr></thead>
            <tbody>
              {q.data.map((r) => (
                <Tr key={r.id}>
                  <Td className="tabular text-ink-3">{r.id}</Td>
                  <Td><Link to={`/cases/${r.case_id}`} className="hover:text-accent"><bdi dir="ltr">{r.case_reference}</bdi></Link></Td>
                  <Td><Link to={`/reports/${r.id}`} className="font-medium text-accent hover:underline">{r.title}</Link></Td>
                  <Td><ReportStatusBadge status={r.status} /></Td>
                  <Td className="tabular">{r.current_revision}</Td>
                  <Td className="whitespace-nowrap">{fmtDateTime(r.approved_at)}</Td>
                  <Td className="whitespace-nowrap text-ink-2">{fmtDateTime(r.updated_at)}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>
      <StartWorkflowDialog open={open} onOpenChange={setOpen} workflow="report" />
    </div>
  );
}
