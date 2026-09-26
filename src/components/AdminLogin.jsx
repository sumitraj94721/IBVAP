import React, { useState } from 'react';

const DEMO_ADMIN_USERNAME = 'admin';
const DEMO_ADMIN_PASSWORD = 'admin123';

export default function AdminLogin({ onLoginSuccess }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Clear stale errors when user starts typing (Step 10)
  const handleUsernameChange = (e) => {
    setUsername(e.target.value);
    if (errorMessage) setErrorMessage('');
  };

  const handlePasswordChange = (e) => {
    setPassword(e.target.value);
    if (errorMessage) setErrorMessage('');
  };

  const saveSessionAndProceed = (officerData, token) => {
    sessionStorage.setItem('isAdmin', 'true');
    sessionStorage.setItem(
      'ibvap_auth_user',
      JSON.stringify(officerData || {
        user_id: 'admin',
        username: 'admin',
        role: 'ADMIN',
        clearance_level: 4,
        rank: 'Sector Commander',
        name: 'Insp. Vikram Singh',
        full_name: 'Insp. Vikram Singh',
        badge: 'BSF-8841',
        badge_id: 'BSF-8841',
        loginTime: new Date().toISOString(),
      })
    );
    if (token) {
      sessionStorage.setItem('ibvap_token', token);
    }
    setIsLoading(false);
    onLoginSuccess();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isLoading) return;

    const trimmedUser = username.trim();

    // Step 16 Test D: Empty field validation
    if (!trimmedUser || !password) {
      setErrorMessage('Please enter both username and password.');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');

    try {
      // Step 5 & 6: Call backend API via Vite proxy (/api/login)
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: trimmedUser,
          password: password,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        saveSessionAndProceed(data.officer, data.token);
        return;
      }

      // Backend explicitly rejected credentials (401 Unauthorized / 403 Forbidden)
      if (response.status === 401 || response.status === 403) {
        setIsLoading(false);
        let detail = 'Invalid admin credentials';
        try {
          const data = await response.json();
          if (data.detail) detail = data.detail;
        } catch (_) {}
        setErrorMessage(detail);
        return;
      }

      // Backend gateway/proxy error (e.g. 500, 502, 503, 504 when backend is offline)
      if (response.status >= 500) {
        if (trimmedUser === DEMO_ADMIN_USERNAME && password === DEMO_ADMIN_PASSWORD) {
          saveSessionAndProceed(null, null);
          return;
        } else {
          setIsLoading(false);
          setErrorMessage('Invalid admin credentials');
          return;
        }
      }

      setIsLoading(false);
      setErrorMessage('Invalid admin credentials');
    } catch (err) {
      // Offline fallback: Network failure / backend offline
      if (trimmedUser === DEMO_ADMIN_USERNAME && password === DEMO_ADMIN_PASSWORD) {
        saveSessionAndProceed(null, null);
        return;
      } else {
        setIsLoading(false);
        setErrorMessage('Invalid admin credentials');
        return;
      }
    }
  };

  return (
    <div className="tactical-login-page">
      {/* Background Cyber Grid */}
      <div className="login-grid-bg"></div>

      <div className="tactical-login-card">
        {/* Tactical Corner Accents */}
        <div className="corner-bracket corner-top-left"></div>
        <div className="corner-bracket corner-top-right"></div>
        <div className="corner-bracket corner-bottom-left"></div>
        <div className="corner-bracket corner-bottom-right"></div>

        <div className="login-card-header">
          <div className="badge-sih">
            <span className="blink-dot"></span>
            <span>RESTRICTED ACCESS // DEFENSE TERMINAL</span>
          </div>

          <h1 className="login-title">IBVAP</h1>
          <p className="login-subtitle">Intelligent Border Video Analytics Platform</p>
          <div className="admin-login-badge">ADMIN LOGIN</div>
        </div>

        {/* Demo Credentials Notice */}
        <div className="login-hint-box">
          <div style={{ fontWeight: 700, color: 'var(--cyan-glow)', marginBottom: 4 }}>
            🎖️ SIH 2026 DEMO CREDENTIALS:
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Username: <code>admin</code></span>
            <span>Password: <code>admin123</code></span>
          </div>
        </div>

        {/* Error Alert Message */}
        {errorMessage && (
          <div className="login-error-banner" role="alert">
            ⚠️ {errorMessage}
          </div>
        )}

        {/* Credentials Form */}
        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="admin-username">Username</label>
            <input
              id="admin-username"
              type="text"
              className="tactical-input"
              value={username}
              onChange={handleUsernameChange}
              placeholder="admin"
              autoComplete="username"
              autoFocus
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="admin-password">Password</label>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                id="admin-password"
                type={showPassword ? 'text' : 'password'}
                className="tactical-input"
                style={{ width: '100%', paddingRight: '42px' }}
                value={password}
                onChange={handlePasswordChange}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '8px',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--cyan-glow)',
                  cursor: 'pointer',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: 0.85,
                }}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                  </svg>
                ) : (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="btn-tactical-login"
            disabled={isLoading}
          >
            {isLoading ? 'VERIFYING CREDENTIALS...' : '[ AUTHENTICATE ]'}
          </button>
        </form>

        <div className="login-card-footer">
          <span>Secure Command Center Access</span>
        </div>
      </div>
    </div>
  );
}
