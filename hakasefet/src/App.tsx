import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AppProvider, useApp } from './state/AppState'
import { Layout } from './ui/Layout'
import { ErrorBox, Loading } from './ui/kit'
import { Onboarding } from './pages/Onboarding'
import { Home } from './pages/Home'
import { VaultIntro } from './pages/VaultIntro'
import { ChallengeLanding } from './pages/ChallengeLanding'
import { Play } from './pages/Play'
import { Result } from './pages/Result'
import { Archive } from './pages/Archive'
import { Fix } from './pages/Fix'
import { MyRoom } from './pages/MyRoom'
import { Profile } from './pages/Profile'

/** Guest-first: anyone without a profile goes through the short welcome, then back to where they were. */
function Guarded({ children }: { children: React.ReactNode }) {
  const { status, profile } = useApp()
  const loc = useLocation()
  if (status === 'loading') return <Loading />
  if (status === 'error')
    return <ErrorBox title="אין גישה לשמירה במכשיר" text="הדפדפן חוסם שמירת נתונים (למשל במצב גלישה פרטית מסוים). נסו בחלון רגיל או בדפדפן אחר." action={<button className="btn btn-gold" onClick={() => location.reload()}>ניסיון חוזר</button>} />
  if (!profile) return <Navigate to={`/welcome?next=${encodeURIComponent(loc.pathname + loc.search)}`} replace />
  return <>{children}</>
}

export default function App() {
  return (
    <AppProvider>
      <HashRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/welcome" element={<Onboarding />} />
            <Route path="/" element={<Guarded><Home /></Guarded>} />
            <Route path="/vault" element={<Guarded><VaultIntro /></Guarded>} />
            <Route path="/challenge" element={<Guarded><ChallengeLanding /></Guarded>} />
            <Route path="/play" element={<Guarded><Play /></Guarded>} />
            <Route path="/result/:id" element={<Guarded><Result /></Guarded>} />
            <Route path="/archive" element={<Guarded><Archive /></Guarded>} />
            <Route path="/fix" element={<Guarded><Fix /></Guarded>} />
            <Route path="/room" element={<Guarded><MyRoom /></Guarded>} />
            <Route path="/profile" element={<Guarded><Profile /></Guarded>} />
            <Route path="*" element={<ErrorBox title="הדף לא נמצא" text="אולי הקישור שגוי." action={<a className="btn btn-gold" href="#/">לדף הבית</a>} />} />
          </Route>
        </Routes>
      </HashRouter>
    </AppProvider>
  )
}
