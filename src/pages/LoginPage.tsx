import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useAuth } from '@/stores/AuthContext';
import './LoginPage.css';

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 已登录 → 跳转
  useEffect(() => {
    if (user) {
      const redirect = searchParams.get('redirect') || '/';
      navigate(redirect, { replace: true });
    }
  }, [user, navigate, searchParams]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!username.trim() || !password) {
      setError('请输入用户名和密码');
      return;
    }

    setSubmitting(true);
    try {
      await login(username.trim(), password, rememberMe);
      const redirect = searchParams.get('redirect') || '/';
      navigate(redirect, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败，请重试');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>🍈 榴莲运输温度监控看板</h1>
        <p className="login-subtitle">请登录以访问数据</p>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="username">用户名</label>
            <input
              id="username"
              type="text"
              className="form-input"
              placeholder="请输入用户名"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">密码</label>
            <input
              id="password"
              type="password"
              className="form-input"
              placeholder="请输入密码"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <label className="remember-row">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
            />
            <span>记住登录状态（7天）</span>
          </label>

          <button type="submit" className="login-btn" disabled={submitting}>
            {submitting ? '登录中...' : '登 录'}
          </button>
        </form>

        {error && <div className="login-error">{error}</div>}
      </div>
    </div>
  );
}
