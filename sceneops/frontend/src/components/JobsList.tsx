import { useNavigate } from "react-router-dom";
import { fmtDateTime } from "@/lib/format";
import type { Job } from "@/lib/types";
import { Progress } from "./ui/progress";
import { EmptyState, SimBadge } from "./ui/misc";
import { Table, Td, Th, Tr } from "./ui/table";
import { JobStatusBadge } from "./StatusBadge";

export function JobsList({ jobs, selected, onSelect }: { jobs: Job[]; selected?: number; onSelect?: (id: number) => void }) {
  const nav = useNavigate();
  if (!jobs.length) return <EmptyState title="אין משימות" description="משימות שיופעלו יופיעו כאן." />;
  const pick = (id: number) => (onSelect ? onSelect(id) : nav(`/automation?job=${id}`));
  return (
    <Table>
      <thead>
        <tr><Th>#</Th><Th>משימה</Th><Th>תיק / מוצג</Th><Th className="min-w-[160px]">התקדמות</Th><Th>סטטוס</Th><Th>הופעלה</Th><Th>על ידי</Th></tr>
      </thead>
      <tbody>
        {jobs.map((j) => (
          <Tr key={j.id} tabIndex={0} onClick={() => pick(j.id)} onKeyDown={(e) => e.key === "Enter" && pick(j.id)}
            className={`cursor-pointer ${selected === j.id ? "bg-accent/10" : ""}`} aria-selected={selected === j.id}>
            <Td className="tabular text-ink-3">{j.id}</Td>
            <Td className="min-w-[200px]">
              <div className="font-medium flex items-center gap-2">{j.workflow_name}{j.is_simulation && <SimBadge />}
                {j.executor === "agent" && <span className="text-[11px] text-violet">סוכן</span>}</div>
              {j.status === "running" && j.current_step && <div className="text-xs text-ink-3">{j.current_step}</div>}
              {j.status === "failed" && j.error && <div className="text-xs text-danger line-clamp-1">{j.error}</div>}
            </Td>
            <Td className="whitespace-nowrap"><bdi dir="ltr">{j.case_reference ?? "—"}</bdi>{j.exhibit_identifier && <> · מוצג <bdi dir="ltr">{j.exhibit_identifier}</bdi></>}</Td>
            <Td>
              <div className="flex items-center gap-2">
                <span className="w-10 tabular text-xs" dir="ltr">{Math.round(j.progress)}%</span>
                <Progress value={j.progress} tone={j.status === "succeeded" ? "green" : j.status === "failed" ? "red" : "blue"} />
              </div>
            </Td>
            <Td><JobStatusBadge status={j.status} /></Td>
            <Td className="whitespace-nowrap text-ink-2">{fmtDateTime(j.created_at)}</Td>
            <Td className="whitespace-nowrap text-ink-2">{j.created_by?.full_name ?? "—"}</Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}
