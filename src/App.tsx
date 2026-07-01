import { Routes, Route, Navigate } from 'react-router';
import { AuthProvider } from '@/stores/AuthContext';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { AdminRoute } from '@/components/auth/AdminRoute';
import LoginPage from '@/pages/LoginPage';

export default function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<div>Dashboard</div>} />
          <Route element={<AdminRoute />}>
            <Route path="/admin" element={<div>Admin Panel</div>} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  );
}
