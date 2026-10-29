import { lazy, Suspense, type ComponentType } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { Layout } from './components/Layout'
import { RequireAuth } from './components/RequireAuth'
import { Spinner } from './components/ui'
import { I18nProvider } from './i18n/I18nProvider'
import { PendingFileProvider } from './lib/pendingFile'
import { HomePage } from './pages/HomePage'

// Pages other than the home page load on demand, so phones download less up
// front (the editor alone brings the waveform library).
const named = <K extends string, P extends object>(load: () => Promise<{ [k in K]: ComponentType<P> }>, name: K) =>
  lazy(() => load().then((m) => ({ default: m[name] })))
const AuthPage = named(() => import('./pages/AuthPage'), 'AuthPage')
const EditorPage = named(() => import('./pages/EditorPage'), 'EditorPage')
const PlayerPage = named(() => import('./pages/PlayerPage'), 'PlayerPage')
const ProjectPage = named(() => import('./pages/ProjectPage'), 'ProjectPage')
const ProjectsPage = named(() => import('./pages/ProjectsPage'), 'ProjectsPage')
const StylePage = named(() => import('./pages/StylePage'), 'StylePage')
const UploadPage = named(() => import('./pages/UploadPage'), 'UploadPage')

const pageFallback = (
  <div className="grid min-h-[50vh] place-items-center text-white/60">
    <Spinner className="size-8" />
  </div>
)

export default function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <PendingFileProvider>
          <BrowserRouter>
            <Suspense fallback={pageFallback}>
            <Routes>
              <Route element={<Layout />}>
                <Route index element={<HomePage />} />
                <Route path="login" element={<AuthPage mode="login" />} />
                <Route path="signup" element={<AuthPage mode="signup" />} />
                <Route path="forgot-password" element={<AuthPage mode="forgot" />} />
                <Route path="reset-password" element={<AuthPage mode="reset" />} />
                <Route path="upload" element={<RequireAuth><UploadPage /></RequireAuth>} />
                <Route path="projects" element={<RequireAuth><ProjectsPage /></RequireAuth>} />
                <Route path="projects/:id" element={<RequireAuth><ProjectPage /></RequireAuth>} />
                <Route path="projects/:id/play" element={<RequireAuth><PlayerPage /></RequireAuth>} />
                <Route path="projects/:id/edit" element={<RequireAuth><EditorPage /></RequireAuth>} />
                <Route path="projects/:id/style" element={<RequireAuth><StylePage /></RequireAuth>} />
                <Route path="*" element={<HomePage />} />
              </Route>
            </Routes>
            </Suspense>
          </BrowserRouter>
        </PendingFileProvider>
      </AuthProvider>
    </I18nProvider>
  )
}
