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
          <span>BORDER INCIDENTS &amp; AI THREAT LOG [{filteredAlerts.length} SHOWN]</span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          AUTOMATIC AI NEURAL CLASSIFIER (YUNET + FER+)
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="alerts-filter-bar">
        {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((lvl) => (
          <button
            key={lvl}
            className={`btn-filter ${filter === lvl ? 'active' : ''}`}
            onClick={() => setFilter(lvl)}
          >
            {lvl} ({lvl === 'ALL' ? alerts.length : alerts.filter(a => a.severity === lvl).length})
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
          filteredAlerts.map((alert) => (
            <div 
              key={alert.id} 
              className={`alert-item-card alert-${alert.severity}`}
            >
              <div className="alert-info-left">
                <div className="alert-badge-row">
                  <span className={`alert-sev-pill sev-${alert.severity}`}>
                    {alert.severity}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--cyan-glow)', fontFamily: 'monospace' }}>
                    [{alert.id}]
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
                    • {alert.sector} ({alert.camera})
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                    ⏱ {alert.timestamp}
                  </span>
                </div>

                <div className="alert-title-text">
                  {alert.title}
                </div>

                <div className="alert-meta-text">
                  {alert.description} | Target ID: <strong style={{ color: 'var(--cyan-glow)' }}>{alert.targetId}</strong> | AI Confidence: <strong style={{ color: alert.confidence > 90 ? 'var(--alert-red)' : 'var(--warning-amber)' }}>{alert.confidence}%</strong>
                </div>
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
          ))
        )}
      </div>
    </div>
  );
}
