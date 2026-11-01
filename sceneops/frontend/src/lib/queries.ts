import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "./api";
import type { Camera, Case, Exhibit, Job, User, Workflow } from "./types";

export const useCases = (params: Record<string, string | undefined> = {}) => {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]).toString();
  return useQuery({ queryKey: ["cases", qs], queryFn: () => api<Case[]>(`/api/cases${qs ? `?${qs}` : ""}`) });
};
export const useCase = (id?: number) =>
  useQuery({ queryKey: ["case", id], queryFn: () => api<Case>(`/api/cases/${id}`), enabled: !!id });
export const useExhibits = (caseId?: number) =>
  useQuery({ queryKey: ["exhibits", caseId], queryFn: () => api<Exhibit[]>(`/api/cases/${caseId}/exhibits`), enabled: !!caseId });
export const useWorkflows = () =>
  useQuery({ queryKey: ["workflows"], queryFn: () => api<Workflow[]>("/api/workflows"), staleTime: Infinity });
export const useCameras = () => useQuery({ queryKey: ["cameras"], queryFn: () => api<Camera[]>("/api/cameras") });
export const useUsers = () => useQuery({ queryKey: ["users"], queryFn: () => api<User[]>("/api/users") });

/** מוטציה עם הודעת הצלחה/שגיאה בעברית ורענון שאילתות */
export function useAction<TVars, TRes = unknown>(fn: (v: TVars) => Promise<TRes>, opts: {
  success?: string | ((r: TRes) => string); invalidate?: string[][]; onSuccess?: (r: TRes) => void;
} = {}) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (r) => {
      if (opts.success) toast.success(typeof opts.success === "function" ? opts.success(r) : opts.success);
      for (const k of opts.invalidate ?? []) qc.invalidateQueries({ queryKey: k });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      opts.onSuccess?.(r);
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export const startJob = (body: Record<string, unknown>) => api<Job>("/api/jobs", { method: "POST", json: body });
