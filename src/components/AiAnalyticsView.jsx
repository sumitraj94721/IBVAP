import React from 'react';
import { ANALYTICS_SUMMARY } from '../data/mockData';

export default function AiAnalyticsView({ threatLevel, kpiData }) {
  const stats = ANALYTICS_SUMMARY;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Top AI Performance Metric Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 12
      }}>
        <div className="kpi-card" style={{ padding: 14 }}>
          <span className="kpi-label">AI RECOGNITION ACCURACY</span>
          <span className="kpi-value" style={{ color: 'var(--status-green)' }}>
            {stats.modelAccuracyPercent}%
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>
            YuNet DNN + ResNet FER+
          </span>
        </div>

        <div className="kpi-card" style={{ padding: 14 }}>
          <span className="kpi-label">INFERENCE LATENCY</span>
          <span className="kpi-value" style={{ color: 'var(--cyan-glow)' }}>
            {stats.avgResponseTimeMs} ms
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>
            CPU Optimized / &lt;15ms frame cycle
          </span>
        </div>

        <div className="kpi-card" style={{ padding: 14 }}>
          <span className="kpi-label">INTRUSIONS PREVENTED</span>
          <span className="kpi-value" style={{ color: 'var(--alert-red)' }}>
            {kpiData.intrusions}
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>
            Zero perimeter breach tolerance
          </span>
        </div>

        <div className="kpi-card" style={{ padding: 14 }}>
          <span className="kpi-label">OVERALL THREAT LEVEL</span>
          <span className="kpi-value" style={{ 
            color: threatLevel === 'CRITICAL' ? 'var(--alert-red)' : 'var(--warning-amber)' 
          }}>
            {threatLevel}
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>
            Active border state
          </span>
        </div>
      </div>

      {/* Main Analytics Charts */}
      <div className="analytics-grid">
        {/* Hourly Threat Detection Activity */}
        <div className="chart-card">
          <div className="chart-header">
            <span>📈 HOURLY SURVEILLANCE &amp; THREAT ACTIVITY (04:00 - 09:00 IST)</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>LIVE ROLLING METRIC</span>
          </div>

          <div className="bar-chart-container">
            {stats.hourlyActivity.map((item, idx) => {
              const maxDetections = 25;
              const heightPercent = Math.max(10, (item.detections / maxDetections) * 100);
              const threatHeight = (item.threats / maxDetections) * 100;

              return (
                <div key={idx} className="bar-column">
                  <div style={{ fontSize: 10, color: 'var(--cyan-glow)', fontWeight: 700 }}>
                    {item.detections}
                  </div>
                  <div className="bar-fill" style={{ height: `${heightPercent}%` }}>
                    {item.threats > 0 && (
                      <div 
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          right: 0,
                          height: `${threatHeight * 2.5}%`,
                          background: 'var(--alert-red)',
                          borderRadius: '3px 3px 0 0'
                        }}
                        title={`${item.threats} Critical Threats`}
                      />
                    )}
                  </div>
                  <div className="bar-label">{item.hour}</div>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: 20, marginTop: 12, fontSize: 11, color: 'var(--text-muted)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 12, height: 12, background: 'var(--cyan-glow)', borderRadius: 2 }}></div>
              <span>Total Object Detections</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 12, height: 12, background: 'var(--alert-red)', borderRadius: 2 }}></div>
              <span>Elevated / Critical Threat Alarms</span>
            </div>
          </div>
        </div>

        {/* Object Classification Breakdown */}
        <div className="chart-card">
          <div className="chart-header">
            <span>🎯 OBJECT CATEGORIES</span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 10 }}>
            {stats.detectionsByCategory.map((cat, i) => (
              <div key={i}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 4 }}>
                  <span>{cat.category}</span>
                  <strong style={{ color: 'var(--cyan-glow)' }}>{cat.count} ({cat.percentage}%)</strong>
                </div>
                <div style={{ width: '100%', height: 7, background: '#090d18', borderRadius: 4, overflow: 'hidden' }}>
                  <div style={{
                    width: `${cat.percentage}%`,
                    height: '100%',
                    background: i === 0 ? 'var(--cyan-glow)' : i === 1 ? 'var(--warning-amber)' : 'var(--status-green)'
                  }}></div>
                </div>
              </div>
            ))}
          </div>

          <div style={{
            marginTop: 20,
            padding: 10,
            background: '#090d18',
            border: '1px solid var(--border-subtle)',
            borderRadius: 4,
            fontSize: 10.5,
            color: 'var(--text-muted)',
            lineHeight: 1.5
          }}>
            <strong style={{ color: 'var(--gold-commander)' }}>SIH 2026 AI ARCHITECTURE:</strong>
            <br />
            1. Fast YuNet face &amp; person detection (&lt;12ms)
            <br />
            2. Centroid &amp; IoU Euclidean tracking (LOC_#ID)
            <br />
            3. Microsoft FER+ ONNX expression profiling
          </div>
        </div>
      </div>
    </div>
  );
}
