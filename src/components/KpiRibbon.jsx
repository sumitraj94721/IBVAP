import React from 'react';

export default function KpiRibbon({ kpiData }) {
  return (
    <section className="kpi-ribbon">
      <div className="kpi-card">
        <span className="kpi-label">TOTAL CAMERAS</span>
        <span className="kpi-value">{kpiData.totalCameras} <span style={{ fontSize: 11, color: 'var(--status-green)' }}>4 ONLINE</span></span>
      </div>

      <div className="kpi-card alert-card">
        <span className="kpi-label">ACTIVE ALERTS</span>
        <span className="kpi-value">{kpiData.activeAlerts}</span>
      </div>

      <div className="kpi-card alert-card">
        <span className="kpi-label">INTRUSIONS DETECTED</span>
        <span className="kpi-value">{kpiData.intrusions}</span>
      </div>

      <div className="kpi-card">
        <span className="kpi-label">PERSONS IDENTIFIED</span>
        <span className="kpi-value">{kpiData.persons}</span>
      </div>

      <div className="kpi-card warning-card">
        <span className="kpi-label">VEHICLES LOGGED</span>
        <span className="kpi-value">{kpiData.vehicles}</span>
      </div>

      <div className="kpi-card status-card">
        <span className="kpi-label">SYSTEM STATUS</span>
        <span className="kpi-value">{kpiData.systemStatus}</span>
      </div>
    </section>
  );
}
