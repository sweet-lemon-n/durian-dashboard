import { Routes, Route, Navigate } from 'react-router';
import { AuthProvider } from '@/stores/AuthContext';
import { ThemeProvider } from '@/stores/ThemeContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { AdminRoute } from '@/components/auth/AdminRoute';
import LoginPage from '@/pages/LoginPage';
import DashboardPage from '@/pages/DashboardPage';
import DashboardSentryPage from '@/pages/DashboardSentryPage';
import DashboardTvPage from '@/pages/DashboardTvPage';
import AdminPage from '@/pages/AdminPage';

export default function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route index element={<DashboardPage />} />
            <Route path="/sentry" element={<DashboardSentryPage />} />
            <Route path="/tv" element={<DashboardTvPage />} />
            <Route element={<AdminRoute />}>
              <Route path="/admin" element={<AdminPage />} />
              <Route path="/admin-sentry" element={<AdminPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ThemeProvider>
    </AuthProvider>
  );
}
