import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { DashboardPage } from './pages/DashboardPage'
import { PlaceholderPage } from './pages/PlaceholderPage'
import { RecordingControlsPage } from './pages/RecordingControlsPage'
import { SettingsPage } from './pages/SettingsPage'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/recording-controls" element={<RecordingControlsPage />} />
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route
            path="/sessions"
            element={
              <PlaceholderPage
                eyebrow="Recordings"
                title="Sessions"
                description="Review captured workflows and their event timelines."
              />
            }
          />
          <Route
            path="/sop-library"
            element={
              <PlaceholderPage
                eyebrow="Documentation"
                title="SOP Library"
                description="Review, edit and publish generated procedures."
              />
            }
          />
          <Route
            path="/analytics"
            element={
              <PlaceholderPage
                eyebrow="Intelligence"
                title="Analytics"
                description="Compare workflow paths and identify process friction."
              />
            }
          />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
