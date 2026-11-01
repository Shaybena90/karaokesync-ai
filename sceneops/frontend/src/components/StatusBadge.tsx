import { CheckCircle2, CircleDashed, Clock, Loader2, PauseCircle, ShieldQuestion, XCircle } from "lucide-react";
import { Badge } from "./ui/badge";
import { CASE_STATUS, JOB_STATUS, PRIORITY, REPORT_STATUS, REVIEW_STATUS, STEP_STATUS } from "@/lib/labels";

export function JobStatusBadge({ status }: { status: string }) {
  const map: Record<string, [React.ComponentProps<typeof Badge>["tone"], React.ReactNode]> = {
    running: ["blue", <Loader2 className="animate-spin" />],
    queued: ["gray", <Clock />],
    awaiting_approval: ["amber", <ShieldQuestion />],
    cancel_requested: ["amber", <PauseCircle />],
    cancelled: ["gray", <XCircle />],
    succeeded: ["green", <CheckCircle2 />],
    failed: ["red", <XCircle />],
  };
  const [tone, icon] = map[status] ?? ["gray", <CircleDashed />];
  return <Badge tone={tone} className="min-w-[84px] justify-center">{icon}{JOB_STATUS[status] ?? status}</Badge>;
}

export function StepStatusBadge({ status }: { status: string }) {
  const tone = ({ running: "blue", succeeded: "green", failed: "red", skipped: "gray", cancelled: "amber", pending: "gray" } as const)[
    status as "running"] ?? "gray";
  return <Badge tone={tone}>{status === "running" && <Loader2 className="animate-spin" />}{STEP_STATUS[status] ?? status}</Badge>;
}

export function CaseStatusBadge({ status }: { status: string }) {
  const tone = ({ open: "blue", in_progress: "violet", pending_review: "amber", closed: "green", archived: "gray" } as const)[
    status as "open"] ?? "gray";
  return <Badge tone={tone}>{CASE_STATUS[status] ?? status}</Badge>;
}

export function PriorityBadge({ priority }: { priority: string }) {
  const tone = ({ low: "gray", medium: "blue", high: "amber", critical: "red" } as const)[priority as "low"] ?? "gray";
  return <Badge tone={tone}>{PRIORITY[priority] ?? priority}</Badge>;
}

export function ReportStatusBadge({ status }: { status: string }) {
  const tone = ({ draft: "amber", in_review: "blue", approved: "green", rejected: "red" } as const)[status as "draft"] ?? "gray";
  return <Badge tone={tone}>{REPORT_STATUS[status] ?? status}</Badge>;
}

export function ReviewBadge({ status }: { status: string }) {
  const tone = ({ candidate: "amber", confirmed: "green", rejected: "gray" } as const)[status as "candidate"] ?? "gray";
  return <Badge tone={tone}>{REVIEW_STATUS[status] ?? status}</Badge>;
}
