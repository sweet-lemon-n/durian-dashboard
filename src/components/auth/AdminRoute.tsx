import { Navigate, Outlet } from 'react-router';
import { useAuth } from '@/stores/AuthContext';

export function AdminRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div
        style={{
          height: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#9fb0cc',
          fontSize: '1.5rem',
          background: '#070b16',
        }}
      >
        Loading...
      </div>
    );
  }

  if (!user) {
    const redirect = window.location.pathname + window.location.search;
    return (
      <Navigate
        to={`/login?redirect=${encodeURIComponent(redirect)}`}
        replace
      />
    );
  }

  if (user.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
