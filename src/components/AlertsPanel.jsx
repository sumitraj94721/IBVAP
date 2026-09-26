import React, { useState } from 'react';

export default function AlertsPanel({ alerts, onAcknowledgeAlert, onEscalateAlert }) {
  const [filter, setFilter] = useState('ALL');

  const filteredAlerts = alerts.filter((a) => {
    if (filter === 'ALL') return true;
    return a.severity === filter;
  });

  return (
    <div className="alerts-section-card">
      <div className="map-header">
        <div className="map-title">
          <span>🚨</span>
          <span>IBVAP BORDER INCIDENTS &amp; EXPLAINABLE AI LOG [{filteredAlerts.length} SHOWN]</span>
        </div>
        <div style={{ fontSize: 10.5, color: 'var(--cyan-glow)', fontWeight: 600 }}>
          IBVAP EXPLAINABLE AI &amp; MULTI-CAMERA CORRELATION ENGINE
        </div>
      </div>

      {/* 5-Level Alert Filter Tabs (INFO, LOW, MEDIUM, HIGH, CRITICAL) */}
      <div className="alerts-filter-bar">
        {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'].map((lvl) => (
          <button
            key={lvl}
            className={`btn-filter ${filter === lvl ? 'active' : ''}`}
            onClick={() => setFilter(lvl)}
          >
            {lvl} ({lvl === 'ALL' ? alerts.length : alerts.filter((a) => a.severity === lvl).length})
          </button>
        ))}
      </div>

      {/* Alerts List */}
      <div className="alerts-list-grid">
        {filteredAlerts.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-dim)' }}>
            No alerts matching severity filter [{filter}].
          </div>
        ) : (
          filteredAlerts.map((alert) => {
            const exp = alert.explainability || null;
            const affected = alert.affected_cameras || null;
            const normal = alert.normal_cameras || null;

            return (
              <div
                key={alert.id}
                className={`alert-item-card alert-${alert.severity}`}
              >
                <div className="alert-info-left" style={{ width: '100%' }}>
                  <div className="alert-badge-row" style={{ flexWrap: 'wrap', gap: 6 }}>
                    <span className={`alert-sev-pill sev-${alert.severity}`}>
                      {alert.severity}
                    </span>
                    <span style={{ fontSize: 10, color: 'var(--cyan-glow)', fontFamily: 'monospace' }}>
                      [{alert.id}]
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                      • {alert.sector} ({alert.camera})
                    </span>
                    {alert.is_demo && (
                      <span
                        style={{
                          fontSize: 9,
                          padding: '1px 6px',
                          background: 'rgba(251, 191, 36, 0.15)',
                          border: '1px solid #fbbf24',
                          color: '#fbbf24',
                          borderRadius: 3,
                          fontWeight: 700,
                        }}
                      >
                        DEMO / SIMULATION
                      </span>
                    )}
                    {alert.is_real_ai && (
                      <span
                        style={{
                          fontSize: 9,
                          padding: '1px 6px',
                          background: 'rgba(16, 185, 129, 0.15)',
                          border: '1px solid #10b981',
                          color: '#10b981',
                          borderRadius: 3,
                          fontWeight: 700,
                        }}
                      >
                        LIVE AI
                      </span>
                    )}
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                      ⏱ {alert.timestamp}
                    </span>
                  </div>

                  <div className="alert-title-text">
                    {alert.title}
                  </div>

                  {/* Multi-Camera Affected vs Normal Camera Distinction (Section 11) */}
                  {affected && affected.length > 0 && (
                    <div style={{ display: 'flex', gap: 10, marginTop: 4, marginBottom: 4, fontSize: 10 }}>
                      <span style={{ color: '#ef4444', fontWeight: 700 }}>
                        Affected Cameras: {affected.join(', ')}
                      </span>
                      {normal && normal.length > 0 && (
                        <span style={{ color: '#10b981', fontWeight: 700 }}>
                          | Normal Camera: {normal.join(', ')}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="alert-meta-text">
                    {alert.description} | Target ID: <strong style={{ color: 'var(--cyan-glow)' }}>{alert.targetId}</strong> | AI Confidence: <strong style={{ color: alert.confidence > 90 ? 'var(--alert-red)' : 'var(--warning-amber)' }}>{alert.confidence}%</strong>
                    {alert.risk_score != null && (
                      <> | Risk Score: <strong style={{ color: '#fbbf24' }}>{alert.risk_score}/100</strong></>
                    )}
                  </div>

                  {/* AI Explainability Panel (WHAT, WHERE, WHEN, OBJECT, WHY, CONFIDENCE) */}
                  {exp && (
                    <div
                      style={{
                        marginTop: 6,
                        padding: '6px 9px',
                        background: 'rgba(6, 12, 24, 0.85)',
                        border: '1px solid rgba(0, 240, 255, 0.25)',
                        borderRadius: 4,
                        fontSize: 9.5,
                        fontFamily: "'JetBrains Mono', monospace",
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                        gap: '2px 12px',
                        color: '#cbd5e1',
                      }}
                    >
                      <div><strong style={{ color: '#00f0ff' }}>WHAT:</strong> {exp.what}</div>
                      <div><strong style={{ color: '#00f0ff' }}>WHERE:</strong> {exp.where}</div>
                      <div><strong style={{ color: '#00f0ff' }}>WHEN:</strong> {exp.when}</div>
                      <div><strong style={{ color: '#00f0ff' }}>OBJECT:</strong> {exp.object}</div>
                      <div style={{ gridColumn: '1 / -1' }}><strong style={{ color: '#fbbf24' }}>WHY:</strong> {exp.why}</div>
                      <div><strong style={{ color: '#10b981' }}>CONFIDENCE:</strong> {exp.confidence}%</div>
                      {alert.scenario_label && (
                        <div><strong style={{ color: '#fbbf24' }}>SCENARIO:</strong> {alert.scenario_label}</div>
                      )}
                    </div>
                  )}

                  {/* Evidence Snapshot & Checklist (Sections 8 & 14) */}
                  {(alert.snapshot_url || alert.evidence_checklist) && (
                    <div
                      style={{
                        marginTop: 6,
                        padding: '6px 9px',
                        background: 'rgba(9, 15, 28, 0.9)',
                        border: '1px solid rgba(251, 191, 36, 0.3)',
                        borderRadius: 4,
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: 10,
                        alignItems: 'center',
                        fontSize: 9,
                      }}
                    >
                      {alert.snapshot_url && (
                        <img
                          src={alert.snapshot_url}
                          alt="Intruder Evidence"
                          style={{ width: 88, height: 52, objectFit: 'cover', borderRadius: 3, border: '1px solid #ef4444' }}
                        />
                      )}
                      {alert.evidence_checklist && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 10px', flex: 1 }}>
                          {alert.evidence_checklist.slice(0, 6).map((c, i) => (
                            <span key={i} style={{ color: c.verified ? '#10b981' : '#94a3b8' }}>
                              {c.verified ? '✔' : '✖'} {c.item}: <strong>{c.detail}</strong>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div className="alert-actions-right">
                  {alert.status === 'ACTIVE' ? (
                    <>
                      <button
                        className="btn-alert-ack"
                        onClick={() => onAcknowledgeAlert(alert.id)}
                        title="Acknowledge and mark under inspection"
                      >
                        ACKNOWLEDGE
                      </button>
                      <button
                        className="btn-alert-ack"
                        style={{ borderColor: 'var(--alert-red)', color: '#ff8585', background: 'var(--alert-red-dim)' }}
                        onClick={() => onEscalateAlert(alert.id)}
                        title="Escalate to Rapid Quick Reaction Team"
                      >
                        DISPATCH QRT
                      </button>
                    </>
                  ) : (
                    <span style={{ fontSize: 11, color: 'var(--status-green)', fontWeight: 600 }}>
                      ✓ {alert.status}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

