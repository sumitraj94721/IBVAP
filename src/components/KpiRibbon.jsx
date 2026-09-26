import React from 'react';

export default function KpiRibbon({ kpiData }) {
  const fps = kpiData.latencyMs ? Math.min(30, Math.max(12, Math.round(1000 / Math.max(25, kpiData.latencyMs)))) : 0;

  return (
    <section className="kpi-ribbon" style={{ gridTemplateColumns: 'repeat(9, 1fr)' }}>
      <div className="kpi-card">
        <span className="kpi-label">PERSONS</span>
        <span className="kpi-value" style={{ color: 'var(--cyan-glow)' }}>
          {String(kpiData.persons ?? 0).padStart(2, '0')}
        </span>
      </div>

      <div className="kpi-card">
        <span className="kpi-label">VEHICLES</span>
        <span className="kpi-value" style={{ color: '#00d2ff' }}>
          {String(kpiData.vehicles ?? 0).padStart(2, '0')}
        </span>
      </div>

      <div className="kpi-card">
        <span className="kpi-label">OBJECTS</span>
        <span className="kpi-value" style={{ color: '#10b981' }}>
          {String(kpiData.objects ?? 0).padStart(2, '0')}
        </span>
      </div>

      <div className="kpi-card">
        <span className="kpi-label">ACTIVE TRACKS</span>
        <span className="kpi-value" style={{ color: '#a78bfa' }}>
          {String(kpiData.activeTracks ?? 0).padStart(2, '0')}
        </span>
      </div>

      <div className="kpi-card">
        <span className="kpi-label">FACE MATCHES</span>
        <span className="kpi-value" style={{ color: kpiData.faceMatches > 0 ? 'var(--status-green)' : 'var(--text-dim)' }}>
          {String(kpiData.faceMatches).padStart(2, '0')}
        </span>
      </div>

      <div className="kpi-card">
        <span className="kpi-label">ANPR EVENTS</span>
        <span className="kpi-value" style={{ color: kpiData.anprEvents > 0 ? '#38bdf8' : 'var(--text-dim)' }}>
          {String(kpiData.anprEvents).padStart(2, '0')}
        </span>
      </div>

      <div className={`kpi-card ${kpiData.intrusions > 0 ? 'alert-card' : ''}`}>
        <span className="kpi-label">ACTIVE INTRUSIONS</span>
        <span className="kpi-value" style={{ color: kpiData.intrusions > 0 ? 'var(--alert-red)' : 'var(--status-green)' }}>
          {String(kpiData.intrusions).padStart(2, '0')}
        </span>
      </div>

      <div className={`kpi-card ${kpiData.activeAlerts > 0 ? 'warning-card' : ''}`}>
        <span className="kpi-label">ACTIVE ALERTS</span>
        <span className="kpi-value">
          {String(kpiData.activeAlerts).padStart(2, '0')}
        </span>
      </div>

      <div className="kpi-card status-card">
        <span className="kpi-label">CAMERA HEALTH / FPS</span>
        <span className="kpi-value" style={{ fontSize: 13, color: 'var(--status-green)' }}>
          {kpiData.totalCameras} CAMS <span style={{ fontSize: 10, color: 'var(--cyan-glow)', marginLeft: 4 }}>{fps} FPS</span>
        </span>
      </div>
    </section>
  );
}
