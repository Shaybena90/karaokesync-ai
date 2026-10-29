import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthProvider'
import { Layout } from './components/Layout'
import { RequireAuth } from './components/RequireAuth'
import { I18nProvider } from './i18n/I18nProvider'
import { PendingFileProvider } from './lib/pendingFile'
import { AuthPage } from './pages/AuthPage'
import { EditorPage } from './pages/EditorPage'
import { HomePage } from './pages/HomePage'
import { PlayerPage } from './pages/PlayerPage'
import { ProjectPage } from './pages/ProjectPage'
import { ProjectsPage } from './pages/ProjectsPage'
import { UploadPage } from './pages/UploadPage'

export default function App() {
  return (
    <I18nProvider>
      <AuthProvider>
        <PendingFileProvider>
          <BrowserRouter>
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
                <Route path="*" element={<HomePage />} />
              </Route>
            </Routes>
          </BrowserRouter>
        </PendingFileProvider>
      </AuthProvider>
    </I18nProvider>
  )
}
