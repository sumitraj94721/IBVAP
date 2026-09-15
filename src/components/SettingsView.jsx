import React, { useState } from 'react';

export default function SettingsView({ onResetDemo }) {
  const [confidenceThreshold, setConfidenceThreshold] = useState(75);
  const [autoSiren, setAutoSiren] = useState(true);
  const [autoLockdown, setAutoLockdown] = useState(true);
  const [opticalFilters, setOpticalFilters] = useState('ALL');

  return (
    <div className="alerts-section-card" style={{ maxWidth: 800 }}>
      <div className="map-header">
        <div className="map-title">
          <span>⚙️</span>
          <span>COMMAND CENTER SURVEILLANCE &amp; AI SENSOR CALIBRATION</span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--cyan-glow)' }}>
          SIH 2026 OPERATIONAL PROFILE
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginTop: 14 }}>
        {/* Confidence Slider */}
        <div className="form-group">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-main)' }}>
              AI DETECTION CONFIDENCE THRESHOLD
            </label>
            <strong style={{ color: 'var(--cyan-glow)', fontSize: 13 }}>
              {confidenceThreshold}%
            </strong>
          </div>
          <input
            type="range"
            min="50"
            max="95"
            value={confidenceThreshold}
            onChange={(e) => setConfidenceThreshold(Number(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--cyan-glow)', cursor: 'pointer' }}
          />
          <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
            Detections below {confidenceThreshold}% will be suppressed from immediate sound alarm and routed to background telemetry.
          </span>
        </div>

        {/* Tactical Countermeasures */}
        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 14 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-main)', display: 'block', marginBottom: 8 }}>
            AUTOMATED DEFENSIVE COUNTERMEASURES
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 12 }}>
              <input
                type="checkbox"
                checked={autoSiren}
                onChange={(e) => setAutoSiren(e.target.checked)}
                style={{ accentColor: 'var(--cyan-glow)', width: 16, height: 16 }}
              />
              <span>Trigger tactical acoustic siren on CRITICAL perimeter fence line breaches</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 12 }}>
              <input
                type="checkbox"
                checked={autoLockdown}
                onChange={(e) => setAutoLockdown(e.target.checked)}
                style={{ accentColor: 'var(--cyan-glow)', width: 16, height: 16 }}
              />
              <span>Automate Sector Delta Barrier Gate hydraulic lockdown on unverified vehicle ANPR</span>
            </label>
          </div>
        </div>

        {/* Optical Filter Spectrum */}
        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 14 }}>
          <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-main)', display: 'block', marginBottom: 8 }}>
            ACTIVE OPTICAL SPECTRUM MODES
          </label>
          <div style={{ display: 'flex', gap: 10 }}>
            {['ALL SPECTRUMS', 'NIGHT VISION (GEN-III)', 'THERMAL FLIR (MWIR)', 'VISIBLE OPTICAL (HD)'].map((mode) => (
              <button
                key={mode}
                className={`btn-filter ${opticalFilters === mode ? 'active' : ''}`}
                onClick={() => setOpticalFilters(mode)}
              >
                {mode}
              </button>
            ))}
          </div>
        </div>

        {/* Demo Reset */}
        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--gold-commander)' }}>
              RESET DEMO SIMULATION STATE
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>
              Restores initial SIH hackathon alerts, counters, and mock incident queue.
            </div>
          </div>
          <button
            className="btn-filter"
            style={{ borderColor: 'var(--alert-red)', color: '#ff9999' }}
            onClick={onResetDemo}
          >
            RESET TO INITIAL STATE
          </button>
        </div>
      </div>
    </div>
  );
}
