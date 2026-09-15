import React, { useState } from 'react';

export default function LoginModal({ onLoginSuccess }) {
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin123');
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMessage('');

    setTimeout(() => {
      // Validate credentials
      if (username.trim() === 'admin' && password === 'admin123') {
        sessionStorage.setItem('ibvap_auth_user', JSON.stringify({
          username: 'admin',
          role: 'SECTOR_COMMANDER',
          clearance: 'LEVEL_4',
          name: 'Insp. Vikram Singh',
          badge: 'BSF-8841',
          loginTime: new Date().toISOString()
        }));
        setIsLoading(false);
        onLoginSuccess();
      } else {
        setIsLoading(false);
        setErrorMessage('Authentication Failed: Invalid Military ID or Access Code. Access Denied.');
      }
    }, 400);
  };

  return (
    <div className="tactical-modal-overlay">
      <div className="tactical-login-card">
        <div className="login-card-header">
          <div className="badge-sih">
            <span className="blink-dot"></span>
            <span>RESTRICTED ACCESS // DEFENSE TERMINAL</span>
          </div>
          <h2>RAKSHAN</h2>
          <p>AI BORDER SURVEILLANCE COMMAND CENTER</p>
          <div className="defense-terminal-tag">SECURITY CLEARANCE AUTHENTICATION GATEWAY</div>
        </div>

        {/* SIH Demo Credentials Banner */}
        <div className="login-hint-box">
          <div style={{ fontWeight: 700, color: 'var(--cyan-glow)', marginBottom: 3 }}>
            🎖️ SIH 2026 DEMO CREDENTIALS:
          </div>
          <div>User ID: <code>admin</code></div>
          <div>Password: <code>admin123</code></div>
        </div>

        {errorMessage && (
          <div className="login-error-banner">
            ⚠️ {errorMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="military-id">MILITARY USER IDENTIFIER</label>
            <input
              id="military-id"
              type="text"
              className="tactical-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. admin"
              autoFocus
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="military-key">TERMINAL ACCESS KEY</label>
            <input
              id="military-key"
              type="password"
              className="tactical-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>

          <button 
            type="submit" 
            className="btn-tactical-login" 
            disabled={isLoading}
          >
            {isLoading ? 'VERIFYING BIOMETRICS & PERMISSION...' : 'AUTHORIZE & ENTER COMMAND GRID ➔'}
          </button>
        </form>
      </div>
    </div>
  );
}
