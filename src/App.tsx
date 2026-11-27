// Маршруты приложения. HashRouter — чтобы обновление страницы на GitHub Pages не давало 404.
import { lazy, Suspense } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from './app/theme';
import { AppShell } from './app/AppShell';
import { ToastProvider } from './ui/overlay';
import { ConfettiHost } from './ui/feedback';
import { CaptureProvider } from './modules/capture/CaptureSheet';
import HomePage from './modules/home/HomePage';
import InboxPage from './modules/inbox/InboxPage';
import TasksPage from './modules/tasks/TasksPage';
import MorePage from './modules/more/MorePage';
import Placeholder from './modules/placeholder/Placeholder';

// Тяжёлые разделы грузятся по требованию
const CalendarPage = lazy(() => import('./modules/calendar/CalendarPage'));
const ReviewPage = lazy(() => import('./modules/review/ReviewPage'));
const FinancePage = lazy(() => import('./modules/finance/FinancePage'));
const SettingsPage = lazy(() => import('./modules/settings/SettingsPage'));
const DesignPage = lazy(() => import('./modules/design/DesignPage'));
const TrashPage = lazy(() => import('./modules/backup/TrashPage'));

export default function App() {
  return (
    <ThemeProvider>
      <HashRouter>
        <ToastProvider>
          <CaptureProvider>
            <AppShell>
              <Suspense fallback={<div className="h-40" />}>
                <Routes>
                  <Route path="/" element={<HomePage />} />
                  <Route path="/inbox" element={<InboxPage />} />
                  <Route path="/tasks" element={<TasksPage />} />
                  <Route path="/calendar" element={<CalendarPage />} />
                  <Route path="/review" element={<ReviewPage />} />
                  <Route path="/review/:kind" element={<ReviewPage />} />
                  <Route path="/finance" element={<FinancePage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/design" element={<DesignPage />} />
                  <Route path="/trash" element={<TrashPage />} />
                  <Route path="/more" element={<MorePage />} />
                  {['/goals', '/health', '/notes', '/later', '/people', '/log', '/search'].map((p) => (
                    <Route key={p} path={p} element={<Placeholder />} />
                  ))}
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
            </AppShell>
          </CaptureProvider>
        </ToastProvider>
      </HashRouter>
      <ConfettiHost />
    </ThemeProvider>
  );
}
