import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { Layout } from "@/components/Layout";
import { Loading } from "@/components/ui/misc";
import LoginPage from "@/pages/LoginPage";

const DashboardPage = lazy(() => import("@/pages/DashboardPage"));
const CasesPage = lazy(() => import("@/pages/CasesPage"));
const CaseDetailPage = lazy(() => import("@/pages/CaseDetailPage"));
const CamerasPage = lazy(() => import("@/pages/CamerasPage"));
const MediaLabPage = lazy(() => import("@/pages/MediaLabPage"));
const MediaDetailPage = lazy(() => import("@/pages/MediaDetailPage"));
const AutomationPage = lazy(() => import("@/pages/AutomationPage"));
const ReportsPage = lazy(() => import("@/pages/ReportsPage"));
const ReportDetailPage = lazy(() => import("@/pages/ReportDetailPage"));
const RemotePage = lazy(() => import("@/pages/RemotePage"));
const NotificationsPage = lazy(() => import("@/pages/NotificationsPage"));
const SettingsPage = lazy(() => import("@/pages/SettingsPage"));
const NotFoundPage = lazy(() => import("@/pages/NotFoundPage"));

export default function App() {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen grid place-items-center"><Loading label="טוען את SceneOps AI…" /></div>;
  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }
  return (
    <Suspense fallback={<Loading />}>
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route element={<Layout />}>
        <Route index element={<DashboardPage />} />
        <Route path="cases" element={<CasesPage />} />
        <Route path="cases/:id" element={<CaseDetailPage />} />
        <Route path="cameras" element={<CamerasPage />} />
        <Route path="media" element={<MediaLabPage />} />
        <Route path="media/:id" element={<MediaDetailPage />} />
        <Route path="automation" element={<AutomationPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="reports/:id" element={<ReportDetailPage />} />
        <Route path="remote" element={<RemotePage />} />
        <Route path="notifications" element={<NotificationsPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
    </Suspense>
  );
}
