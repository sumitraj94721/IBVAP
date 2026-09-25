import React from 'react';
import { ANALYTICS_SUMMARY } from '../data/mockData';

export default function AiAnalyticsView({ threatLevel, kpiData, aiTelemetry }) {
  const stats = ANALYTICS_SUMMARY;

  // Live metrics from WebSocket / AI Pipeline
  const liveStats = aiTelemetry?.aiStats || {};
  const livePersons = aiTelemetry?.targets?.length ?? kpiData?.persons ?? 0;
  const liveVehicles = aiTelemetry?.vehicles?.length ?? kpiData?.vehicles ?? 0;
  const activeTracksCount = (aiTelemetry?.tracks?.length) || (livePersons + liveVehicles);
  const faceMatchesCount = aiTelemetry?.faceMatches?.length ?? kpiData?.faceMatches ?? 0;
  const anprEventsCount = aiTelemetry?.anprEvents?.length ?? kpiData?.anprEvents ?? 0;
  const liveZoneIntrusions = aiTelemetry?.zoneIntrusions ?? kpiData?.intrusions ?? 0;
  const liveLoitering = aiTelemetry?.loiteringCount ?? 0;
  const liveThreat = aiTelemetry?.threatScore ?? 0;
  const liveLatency = aiTelemetry?.latencyMs ?? 0;

  const yoloModel = liveStats.yolo_model || 'yolov8n.pt';
  const yoloDevice = liveStats.yolo_device || 'CPU';
  const yoloStatus = liveStats.yolo_status || (aiTelemetry ? 'ONLINE' : 'STANDBY');
  const faceEngine = liveStats.face_engine || 'YuNet + SFace-128D (ONNX)';
  const anprStatus = liveStats.anpr_status || 'ANPR MODEL NOT CONFIGURED';

  const isLive = Boolean(aiTelemetry);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* ── Live Multi-Object Analytics Banner ─────────────────────────── */}
      <div style={{
        background: '#040814',
        border: '1px solid var(--border-subtle)',
        borderRadius: 6,
        padding: '12px 18px',
        display: 'flex',
        flexWrap: 'wrap',
        gap: 22,
        alignItems: 'center',
        boxShadow: '0 2px 10px rgba(0,0,0,0.5)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-ui)', fontWeight: 700 }}>
            AI ANALYTICS
          </span>
          <span style={{
            fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-ui)',
            color: isLive ? 'var(--status-green)' : 'var(--text-dim)',
            background: isLive ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255,255,255,0.05)',
            padding: '2px 8px',
            borderRadius: 4
          }}>
            {isLive ? '● REAL AI ACTIVE' : '○ ENGINE STANDBY'}
          </span>
        </div>

        {[
          { label: 'PERSONS', value: String(livePersons).padStart(2, '0'), color: 'var(--cyan-glow)' },
          { label: 'VEHICLES', value: String(liveVehicles).padStart(2, '0'), color: '#00d2ff' },
          { label: 'ACTIVE TRACKS', value: String(activeTracksCount).padStart(2, '0'), color: '#a78bfa' },
          { label: 'FACE MATCHES', value: String(faceMatchesCount).padStart(2, '0'), color: faceMatchesCount > 0 ? 'var(--status-green)' : 'var(--text-dim)' },
          { label: 'ANPR EVENTS', value: String(anprEventsCount).padStart(2, '0'), color: anprEventsCount > 0 ? '#38bdf8' : 'var(--text-dim)' },
          { label: 'INTRUSIONS', value: String(liveZoneIntrusions).padStart(2, '0'), color: liveZoneIntrusions > 0 ? 'var(--alert-red)' : 'var(--status-green)' },
          { label: 'THREAT SCORE', value: `${liveThreat}/100`, color: liveThreat >= 55 ? 'var(--alert-red)' : 'var(--cyan-glow)' },
          { label: 'LATENCY', value: liveLatency > 0 ? `${liveLatency.toFixed(0)} ms` : '--', color: 'var(--text-main)' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <span style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'var(--font-ui)', letterSpacing: 1 }}>{label}</span>
            <span style={{
              fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-mono)',
              color: color
            }}>{value}</span>
          </div>
        ))}
      </div>

      {/* ── Model Pipeline Architecture Cards ──────────────────────────── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 12
      }}>
        <div className="kpi-card" style={{ padding: 14 }}>
          <span className="kpi-label">YOLO OBJECT DETECTOR</span>
          <span className="kpi-value" style={{ color: 'var(--status-green)', fontSize: 16 }}>
            {yoloModel.toUpperCase()}
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>
            Device: <strong>{yoloDevice}</strong> | Multi-Class Surveillance
          </span>
        </div>

        <div className="kpi-card" style={{ padding: 14 }}>
          <span className="kpi-label">MULTI-OBJECT TRACKER</span>
          <span className="kpi-value" style={{ color: 'var(--cyan-glow)', fontSize: 16 }}>
            BYTETRACK / IOU
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>
            Persistent Target IDs (P-xxx &amp; V-xxx)
          </span>
        </div>

        <div className="kpi-card" style={{ padding: 14 }}>
          <span className="kpi-label">FACE RECOGNITION</span>
          <span className="kpi-value" style={{ color: '#a78bfa', fontSize: 15 }}>
            SFACE 128D (ONNX)
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>
            YuNet DNN + Cosine Watchlist Matching
          </span>
        </div>

        <div className="kpi-card" style={{ padding: 14 }}>
          <span className="kpi-label">ANPR PIPELINE</span>
          <span className="kpi-value" style={{ color: '#38bdf8', fontSize: 14 }}>
            {anprStatus.includes('NOT CONFIGURED') ? 'STANDBY' : 'ONLINE'}
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>
            {anprStatus}
          </span>
        </div>
      </div>

      {/* ── Active Multi-Object Tracks Split Grid ──────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {/* Person Tracks Table */}
        <div className="chart-card">
          <div className="chart-header">
            <span>👤 ACTIVE PERSON TRACKS [{livePersons}]</span>
            <span style={{ fontSize: 10, color: 'var(--cyan-glow)' }}>P-SERIES IDENTIFIERS</span>
          </div>

          <div style={{ marginTop: 10, maxHeight: 180, overflowY: 'auto' }}>
            {(!aiTelemetry?.targets || aiTelemetry.targets.length === 0) ? (
              <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-dim)', fontSize: 11 }}>
                No active person targets currently in optical view.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ color: 'var(--text-dim)', borderBottom: '1px solid var(--border-subtle)', textAlign: 'left' }}>
                    <th style={{ padding: '4px 6px' }}>TRACK</th>
                    <th>CONF</th>
                    <th>DIRECTION</th>
                    <th>SPEED</th>
                    <th>FACE MATCH</th>
                    <th>ZONE</th>
                  </tr>
                </thead>
                <tbody>
                  {aiTelemetry.targets.map((t) => (
                    <tr key={t.target_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                      <td style={{ padding: '6px', color: 'var(--cyan-glow)', fontWeight: 700 }}>{t.target_id}</td>
                      <td>{t.detection_confidence?.toFixed(0)}%</td>
                      <td style={{ color: '#38bdf8' }}>{t.direction || 'STAT'}</td>
                      <td>{t.relative_speed ? `${t.relative_speed.toFixed(1)} px/s` : '0.0'}</td>
                      <td style={{ color: t.face_match?.face_match ? 'var(--status-green)' : 'var(--text-dim)' }}>
                        {t.face_match?.face_match ? t.face_match.display_name : 'UNKNOWN'}
                      </td>
                      <td style={{ color: t.in_restricted_zone ? 'var(--alert-red)' : 'var(--status-green)' }}>
                        {t.in_restricted_zone ? 'RESTRICTED' : 'CLEAR'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Vehicle Tracks Table */}
        <div className="chart-card">
          <div className="chart-header">
            <span>🚗 ACTIVE VEHICLE TRACKS [{liveVehicles}]</span>
            <span style={{ fontSize: 10, color: '#00d2ff' }}>V-SERIES IDENTIFIERS</span>
          </div>

          <div style={{ marginTop: 10, maxHeight: 180, overflowY: 'auto' }}>
            {(!aiTelemetry?.vehicles || aiTelemetry.vehicles.length === 0) ? (
              <div style={{ padding: 16, textAlign: 'center', color: 'var(--text-dim)', fontSize: 11 }}>
                No active vehicle targets currently in optical view.
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ color: 'var(--text-dim)', borderBottom: '1px solid var(--border-subtle)', textAlign: 'left' }}>
                    <th style={{ padding: '4px 6px' }}>TRACK</th>
                    <th>TYPE</th>
                    <th>CONF</th>
                    <th>DIRECTION</th>
                    <th>SPEED</th>
                    <th>PLATE</th>
                  </tr>
                </thead>
                <tbody>
                  {aiTelemetry.vehicles.map((v) => (
                    <tr key={v.track_id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                      <td style={{ padding: '6px', color: '#00d2ff', fontWeight: 700 }}>{v.track_id}</td>
                      <td>{v.object_type || 'VEHICLE'}</td>
                      <td>{v.confidence?.toFixed(0)}%</td>
                      <td style={{ color: '#38bdf8' }}>{v.direction || 'STAT'}</td>
                      <td>{v.relative_speed ? `${v.relative_speed.toFixed(1)} px/s` : '0.0'}</td>
                      <td style={{ color: v.plate && v.plate !== 'N/A' ? '#f59e0b' : 'var(--text-dim)', fontWeight: 600 }}>
                        {v.plate || 'STANDBY'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* ── Main Analytics Charts ──────────────────────────────────────── */}
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
            <span>🎯 MULTI-OBJECT SURVEILLANCE ARCHITECTURE</span>
          </div>

          <div style={{
            marginTop: 10,
            padding: 12,
            background: '#090d18',
            border: '1px solid var(--border-subtle)',
            borderRadius: 4,
            fontSize: 11,
            color: 'var(--text-main)',
            lineHeight: 1.7
          }}>
            <strong style={{ color: 'var(--gold-commander)' }}>SIH 26187 / RAKSHAN UPGRADED PIPELINE:</strong>
            <br />
            1. <strong>Ultralytics YOLOv8</strong> multi-class object detection (person, car, truck, bus, bike)
            <br />
            2. <strong>ByteTrack Multi-Object Tracker</strong> with persistent <code>P-xxx</code> and <code>V-xxx</code> IDs
            <br />
            3. <strong>YuNet + SFace 128D</strong> facial alignment &amp; cosine watchlist matching
            <br />
            4. <strong>Dedicated ANPR Pipeline</strong> with syntax validation (no fake detections)
            <br />
            5. <strong>Observable CV Event Engine</strong> (zone intrusions, loitering, speed violations)
          </div>
        </div>
      </div>
    </div>
  );
}
