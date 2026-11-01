import { Check, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useAction } from "@/lib/queries";
import type { Finding } from "@/lib/types";
import { Button } from "./ui/button";

export function FindingReviewButtons({ finding, invalidate }: { finding: Finding; invalidate?: string[] }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const m = useAction((review_status: string) => api(`/api/media/findings/${finding.id}`, { method: "PATCH", json: { review_status } }), {
    success: "סטטוס הבדיקה עודכן", invalidate: [["media-detail"], ["timeline"]],
    onSuccess: () => invalidate && qc.invalidateQueries({ queryKey: invalidate }),
  });
  if (!can("investigator")) return null;
  return (
    <div className="flex gap-1">
      <Button size="sm" variant="ghost" onClick={() => m.mutate("confirmed")} disabled={finding.review_status === "confirmed"}
        aria-label="סימון כאושר בבדיקה" title="אושר בבדיקה ידנית"><Check className="text-ok" /></Button>
      <Button size="sm" variant="ghost" onClick={() => m.mutate("rejected")} disabled={finding.review_status === "rejected"}
        aria-label="סימון כנדחה בבדיקה" title="נדחה בבדיקה ידנית"><X className="text-danger" /></Button>
    </div>
  );
}
