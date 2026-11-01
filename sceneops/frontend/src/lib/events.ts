import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { fileUrl, getToken } from "./api";
import { DEMO } from "./demo";

/** חיבור SSE: עדכוני משימות והתראות בזמן אמת, עם ריענון שאילתות TanStack Query. */
export function useLiveEvents(enabled: boolean) {
  const qc = useQueryClient();
  useEffect(() => {
    if (DEMO || !enabled || !getToken() || typeof EventSource === "undefined") return;
    const es = new EventSource(fileUrl("/api/events/stream"));
    let timer: ReturnType<typeof setTimeout> | null = null;
    const refresh = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        qc.invalidateQueries({ queryKey: ["jobs"] });
        qc.invalidateQueries({ queryKey: ["job"] });
        qc.invalidateQueries({ queryKey: ["dashboard"] });
        qc.invalidateQueries({ queryKey: ["media"] });
        qc.invalidateQueries({ queryKey: ["reports"] });
        qc.invalidateQueries({ queryKey: ["remote"] });
        qc.invalidateQueries({ queryKey: ["exhibits"] });
      }, 400);
    };
    es.addEventListener("jobs", refresh);
    es.addEventListener("cameras", () => qc.invalidateQueries({ queryKey: ["cameras"] }));
    es.addEventListener("notifications", (e) => {
      try {
        const { unread } = JSON.parse((e as MessageEvent).data);
        qc.setQueryData(["unread"], { unread });
      } catch {
        /* התעלמות */
      }
      qc.invalidateQueries({ queryKey: ["notifications"] });
    });
    return () => {
      if (timer) clearTimeout(timer);
      es.close();
    };
  }, [enabled, qc]);
}
