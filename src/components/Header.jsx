import React, { useState, useEffect } from 'react';

export default function Header({ threatLevel, onLogout, isSirenActive, onToggleSiren }) {
  const [timeStr, setTimeStr] = useState('');
  const [dateStr, setDateStr] = useState('');
  const [officerDisplay, setOfficerDisplay] = useState('Admin (BSF-HQ)');

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('ibvap_auth_user');
      if (stored) {
        const u = JSON.parse(stored);
        const name = u.name || u.full_name || u.username || 'Admin';
        const badge = u.badge || u.badge_id || 'BSF-HQ';
        setOfficerDisplay(`${name} (${badge})`);
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    const updateClock = () => {
      const now = new Date();
      const h = String(now.getHours()).padStart(2, '0');
      const m = String(now.getMinutes()).padStart(2, '0');
      const s = String(now.getSeconds()).padStart(2, '0');
      const ms = String(Math.floor(now.getMilliseconds() / 10)).padStart(2, '0');
      setTimeStr(`${h}:${m}:${s}.${ms}`);

      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const day = String(now.getDate()).padStart(2, '0');
      setDateStr(`${year}-${month}-${day} [IST]`);
    };

    updateClock();
    const timer = setInterval(updateClock, 50);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="soc-header">
      <div className="banner-left">
        <div className="badge-sih">
          <span className="blink-dot"></span>
          <span>SIH 2026</span>
        </div>
        <div className="banner-title-group">
          <h1>RAKSHAN — AI BORDER SURVEILLANCE COMMAND CENTER</h1>
          <div className="sub">COMMAND CENTER DASHBOARD &amp; TACTICAL AI SURVEILLANCE GRID</div>
        </div>
      </div>

      <div className="banner-right">
        {/* Border Threat Level Indicator */}
        <div className={`header-threat-badge threat-${threatLevel}`}>
          <span className={`blink-dot ${threatLevel === 'CRITICAL' ? 'blink-red' : ''}`}></span>
          <span>THREAT: {threatLevel}</span>
        </div>

        {/* Tactical Countermeasure Status */}
        {isSirenActive && (
          <button 
            onClick={onToggleSiren}
            className="btn-header-logout" 
            style={{ background: 'var(--alert-red)', color: '#fff', animation: 'pulse-dot 1s infinite' }}
            title="Silence emergency siren"
          >
            🚨 SIREN ACTIVE (SILENCE)
          </button>
        )}

        {/* Authenticated Officer Pill */}
        <div className="header-officer-pill">
          <span style={{ color: 'var(--gold-commander)' }}>🎖️</span>
          <span>OFFICER: <strong>{officerDisplay}</strong></span>
          <button 
            className="btn-header-logout" 
            onClick={onLogout} 
            title="Sign out of Command Center"
          >
            LOGOUT
          </button>
        </div>

        {/* Telemetry Clock */}
        <div className="clock-telemetry">
          <div className="time-val">{timeStr}</div>
          <div className="date-val">{dateStr}</div>
        </div>
      </div>
    </header>
  );
}
