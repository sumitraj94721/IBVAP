import React, { useState } from 'react';

export default function AdminLogin({ onLoginSuccess }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage('');

    try {
      // Attempt backend authentication via FastAPI
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: username.trim(),
          password: password,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        sessionStorage.setItem('isAdmin', 'true');
        sessionStorage.setItem(
          'ibvap_auth_user',
          JSON.stringify(data.officer || {
            username: 'admin',
            role: 'SECTOR_COMMANDER',
            clearance: 'LEVEL_4',
            name: 'Insp. Vikram Singh',
            badge: 'BSF-8841',
            loginTime: new Date().toISOString(),
          })
        );
        if (data.token) {
          sessionStorage.setItem('ibvap_token', data.token);
        }
        setIsLoading(false);
        onLoginSuccess();
        return;
      } else {
        setIsLoading(false);
        setErrorMessage('Invalid admin credentials');
        return;
      }
    } catch (err) {
      // Graceful fallback to demo credentials if backend service is offline
      if (username.trim() === 'admin' && password === 'admin123') {
        sessionStorage.setItem('isAdmin', 'true');
        sessionStorage.setItem(
          'ibvap_auth_user',
          JSON.stringify({
            username: 'admin',
            role: 'SECTOR_COMMANDER',
            clearance: 'LEVEL_4',
            name: 'Insp. Vikram Singh',
            badge: 'BSF-8841',
            loginTime: new Date().toISOString(),
          })
        );
        setIsLoading(false);
        onLoginSuccess();
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

          <h1 className="login-title">RAKSHAN</h1>
          <p className="login-subtitle">AI Border Surveillance Command Center</p>
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
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
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
                style={{ width: '100%', paddingRight: '40px' }}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
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
                  fontSize: '15px',
                  padding: '4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? '🙈' : '👁️'}
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
