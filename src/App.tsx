import { Routes, Route, Navigate } from 'react-router';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<div>Login Page</div>} />
      {/* Dashboard pages — added in Task 10 */}
      {/* Admin pages — added in Task 13 */}
      {/* Other pages — added in Task 17 */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
