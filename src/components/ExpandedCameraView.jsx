/**
 * IBVAP - Expanded Camera View (Fullscreen AI Intelligence View)
 * Shows enlarged live video stream with full AI bounding box overlays,
 * object names, confidence, track IDs, risk status, virtual zone,
 * object counters, AI status strip, active alerts, and inspection sidebar.
 */
import React, { useState, useEffect, useRef } from 'react';

// ─── Risk helpers ──────────────────────────────────────────────────────────
function getRiskColor(level) {
  switch ((level || '').toUpperCase()) {
    case 'CRITICAL': return '#ef4444';
    case 'HIGH RISK':
    case 'HIGH':     return '#f97316';
    case 'SUSPICIOUS EVENT':
    case 'SUSPICIOUS': return '#fbbf24';
    case 'MONITORED': return '#38bdf8';
    case 'NORMAL':   return '#10b981';
    default:         return '#10b981';
  }
}

function getRiskTag(obj) {
  if (!obj) return { level: 'NORMAL', reason: 'NORMAL OBJECT' };
  const cls = (obj.class_name || obj.object_type || obj.class || 'OBJECT').toUpperCase();
  const isZone = obj.in_restricted_zone || obj.inRestrictedZone;
  const loitering = obj.loitering;
  if (isZone && loitering) return { level: 'CRITICAL', reason: `${cls} LOITERING IN RESTRICTED ZONE (${(obj.dwell_seconds || 0).toFixed(0)}s)` };
  if (isZone)              return { level: 'HIGH RISK', reason: `${cls} CROSSED RESTRICTED BOUNDARY` };
  if (loitering)           return { level: 'SUSPICIOUS EVENT', reason: `LOITERING ${(obj.dwell_seconds || 0).toFixed(0)}s` };
  const backendRisk = (obj.risk_level || '').toUpperCase();
  if (backendRisk) {
    return { level: backendRisk, reason: obj.risk_reason || (backendRisk === 'MONITORED' ? 'TRACKED TARGET' : 'NORMAL OBJECT') };
  }
  const cat = (obj.category || '').toLowerCase();
  if (cat === 'person' || cat === 'vehicle') return { level: 'MONITORED', reason: `${cls} TRACKED` };
  return { level: 'NORMAL', reason: 'NORMAL OBJECT' };
}

// ─── Object Row component ─────────────────────────────────────────────────
function ObjectRow({ obj, onSelect, isSelected }) {
  const tag = getRiskTag(obj);
  const riskColor = getRiskColor(tag.level);
  const name = (obj.class_name || obj.object_type || obj.class || 'OBJECT').toUpperCase();
  const trackId = obj.track_id || obj.target_id || '--';
  const conf = obj.confidence_pct ?? obj.detection_confidence ?? obj.confidence ?? 0;
  return (
    <div
      onClick={() => onSelect(obj)}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '5px 8px', cursor: 'pointer',
        background: isSelected ? `${riskColor}18` : 'transparent',
        border: isSelected ? `1px solid ${riskColor}` : '1px solid transparent',
        borderRadius: 3, marginBottom: 2, transition: 'all 0.15s',
      }}
    >
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: riskColor, flexShrink: 0 }} />
      <span style={{ color: riskColor, fontWeight: 700, fontSize: 10, minWidth: 68 }}>{name}</span>
      <span style={{ color: '#94a3b8', fontSize: 9, minWidth: 46, fontWeight: 600 }}>{trackId}</span>
      <span style={{ color: '#e2e8f0', fontSize: 9, minWidth: 34 }}>{typeof conf === 'number' ? conf.toFixed(0) : conf}%</span>
      <span style={{ color: riskColor, fontSize: 8, flex: 1, textAlign: 'right', fontWeight: 700 }}>{tag.level}</span>
    </div>
  );
}

// ─── Main Expanded Camera View ────────────────────────────────────────────
export default function ExpandedCameraView({
  cameraId = 'CAM-01',
  cameraUrl = '/video_feed/cam1',
  videoStream = null,
  isCameraActive = false,
  aiTelemetry = null,
  onClose,
}) {
  const [selectedObj, setSelectedObj] = useState(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef(null);
  const expandedVideoRef = useRef(null);
  const expandedCanvasRef = useRef(null);

  const targets = aiTelemetry?.targets || [];
  const vehicles = aiTelemetry?.vehicles || [];
  const otherObjects = aiTelemetry?.otherObjects || aiTelemetry?.other_objects || [];
  const allObjects = [
    ...targets.map(t => ({ ...t, _renderType: 'person' })),
    ...vehicles.map(v => ({ ...v, _renderType: 'vehicle' })),
    ...otherObjects.map(o => ({ ...o, _renderType: 'object' })),
  ];

  const personCount = targets.length;
  const vehicleCount = vehicles.length;
  const objectCount = otherObjects.length;
  const activeAlerts = (aiTelemetry?.aiAlerts || []).filter(a => a.status === 'ACTIVE');
  const alertCount = activeAlerts.length;
  const activeTracksCount = (aiTelemetry?.tracks || []).length || allObjects.length;
  const latency = aiTelemetry?.latencyMs || 0;
  const fpsVal = latency > 0 ? Math.min(30, Math.max(8, Math.round(1000 / Math.max(25, latency)))) : '--';
  const yoloStatus = aiTelemetry?.aiStats?.yolo_status || (aiTelemetry ? 'ONLINE' : 'OFFLINE');
  const yoloModel = aiTelemetry?.aiStats?.yolo_model || 'yolov8n.pt';
  const threatScore = aiTelemetry?.threatScore || 0;
  const zoneIntrusions = aiTelemetry?.zoneIntrusions || 0;
  const weaponStatus = aiTelemetry?.aiStats?.weapon_detection || 'NOT CONFIGURED';

  const threatColor = threatScore >= 75 ? '#ef4444' : threatScore >= 55 ? '#f97316' : threatScore >= 30 ? '#fbbf24' : '#10b981';
  const threatLabel = threatScore >= 75 ? 'CRITICAL' : threatScore >= 55 ? 'HIGH RISK' : threatScore >= 30 ? 'SUSPICIOUS EVENT' : 'NORMAL';

  // Attach existing browser camera MediaStream to expanded <video> without rebuilding stream
  useEffect(() => {
    if (expandedVideoRef.current && videoStream) {
      if (expandedVideoRef.current.srcObject !== videoStream) {
        expandedVideoRef.current.srcObject = videoStream;
      }
      expandedVideoRef.current.play().catch(() => {});
    }
  }, [videoStream, isCameraActive]);

  // Draw real-time AI bounding boxes, labels, track IDs, confidence, risk, and virtual zone on expanded canvas
  useEffect(() => {
    let animId;

    const renderCornerReticles = (ctx, x, y, w, h, color) => {
      const cornerLen = Math.min(26, Math.max(10, w * 0.22));
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(x, y + cornerLen); ctx.lineTo(x, y); ctx.lineTo(x + cornerLen, y);
      ctx.moveTo(x + w - cornerLen, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + cornerLen);
      ctx.moveTo(x, y + h - cornerLen); ctx.lineTo(x, y + h); ctx.lineTo(x + cornerLen, y + h);
      ctx.moveTo(x + w - cornerLen, y + h); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w, y + h - cornerLen);
      ctx.stroke();
    };

    const drawExpandedOverlay = () => {
      const canvas = expandedCanvasRef.current;
      if (canvas) {
        const cw = canvas.clientWidth || 960;
        const ch = canvas.clientHeight || 540;
        if (canvas.width !== cw || canvas.height !== ch) {
          canvas.width = cw;
          canvas.height = ch;
        }
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, cw, ch);

        // 1. Virtual Restricted Zone (ZONE-ALPHA: 30%-80% x, 20%-85% y)
        const zx = 0.30 * cw, zy = 0.20 * ch, zw = 0.50 * cw, zh = 0.65 * ch;
        ctx.strokeStyle = zoneIntrusions > 0 ? 'rgba(239, 68, 68, 0.75)' : 'rgba(251, 191, 36, 0.35)';
        ctx.lineWidth = 2;
        ctx.setLineDash([8, 5]);
        ctx.strokeRect(zx, zy, zw, zh);
        ctx.setLineDash([]);
        ctx.fillStyle = zoneIntrusions > 0 ? 'rgba(239, 68, 68, 0.9)' : 'rgba(251, 191, 36, 0.75)';
        ctx.font = "bold 11px 'JetBrains Mono', monospace";
        ctx.fillText('⚑ RESTRICTED ZONE [SECTOR ALPHA]', zx + 8, zy + 16);

        // 2. Border Zero-Line
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([10, 6]);
        ctx.beginPath();
        ctx.moveTo(16, ch * 0.82);
        ctx.lineTo(cw - 16, ch * 0.82);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(0, 240, 255, 0.65)';
        ctx.font = "10px 'JetBrains Mono', monospace";
        ctx.fillText('BORDER ZERO-LINE BP-44 // PATROL CORRIDOR ALPHA', 20, ch * 0.82 - 6);

        // 3. Draw all detected objects (Persons, Vehicles, General Objects)
        allObjects.forEach((obj) => {
          const [nx, ny, nw, nh] = obj.normalized_box || [0, 0, 0, 0];
          const x = nx * cw;
          const y = ny * ch;
          const w = nw * cw;
          const h = nh * ch;
          if (w < 4 || h < 4) return;

          const tag = getRiskTag(obj);
          const color = getRiskColor(tag.level);
          const name = (obj.class_name || obj.object_type || obj.class || 'OBJECT').toUpperCase();
          const trackId = obj.track_id || obj.target_id || '--';
          const conf = obj.confidence_pct ?? obj.detection_confidence ?? obj.confidence ?? 0;
          const confStr = `${typeof conf === 'number' ? conf.toFixed(0) : conf}%`;

          ctx.fillStyle = obj.in_restricted_zone ? 'rgba(239, 68, 68, 0.14)' : 'rgba(0, 0, 0, 0.15)';
          ctx.fillRect(x, y, w, h);
          renderCornerReticles(ctx, x, y, w, h, color);

          ctx.strokeStyle = color;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([5, 4]);
          ctx.strokeRect(x, y, w, h);
          ctx.setLineDash([]);

          // Multi-line label card above bounding box
          const lines = [
            { text: `${name} ${trackId}  [${confStr}]`, color, bold: true },
            { text: `RISK: ${tag.level}`, color, bold: true },
          ];
          if (obj._renderType === 'person') {
            lines.push({ text: `ACTIVITY: ${obj.activity || obj.movement || 'STANDING'}`, color: '#00f0ff', bold: true });
            if (obj.holding_status && obj.holding_status !== 'NONE') {
              lines.push({ text: obj.holding_status, color: '#fbbf24', bold: true });
            }
            const fm = obj.face_match;
            if (fm && fm.face_match && fm.display_name && fm.display_name !== 'UNKNOWN') {
              lines.push({ text: `KNOWN: ${fm.display_name} (${(fm.similarity * 100).toFixed(0)}%)`, color: '#10b981', bold: true });
            } else if (obj.has_face) {
              lines.push({ text: 'FACE DETECTED: UNKNOWN', color: '#fbbf24' });
            } else {
              lines.push({ text: 'FACE: NOT VISIBLE', color: '#94a3b8' });
            }
          }
          if (obj.plate && obj.plate !== 'N/A') {
            lines.push({ text: `PLATE: ${obj.plate}`, color: '#f59e0b', bold: true });
          }
          if (obj.in_restricted_zone) {
            lines.push({ text: '⚠ RESTRICTED ZONE INTRUSION', color: '#ef4444', bold: true });
          }

          const lineH = 15;
          const panelH = lines.length * lineH + 8;
          const panelW = 225;
          const px = Math.min(x, cw - panelW - 4);
          const py = Math.max(panelH + 4, y - 4);

          ctx.fillStyle = 'rgba(4, 7, 18, 0.92)';
          ctx.fillRect(px, py - panelH, panelW, panelH);
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.2;
          ctx.strokeRect(px, py - panelH, panelW, panelH);

          lines.forEach((ln, idx) => {
            ctx.fillStyle = ln.color || '#e2e8f0';
            ctx.font = `${ln.bold ? 'bold ' : ''}11px 'JetBrains Mono', monospace`;
            ctx.fillText(ln.text, px + 6, py - panelH + 14 + idx * lineH);
          });
        });
      }
      animId = requestAnimationFrame(drawExpandedOverlay);
    };

    animId = requestAnimationFrame(drawExpandedOverlay);
    return () => cancelAnimationFrame(animId);
  }, [aiTelemetry, zoneIntrusions]);

  const handleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  // Inspection detail for selected object
  const tag = selectedObj ? getRiskTag(selectedObj) : null;
  const riskColor = selectedObj ? getRiskColor(tag.level) : '#10b981';

  return (
    <div
      ref={containerRef}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: '#020408', display: 'flex', flexDirection: 'column',
        fontFamily: "'JetBrains Mono', monospace",
      }}
    >
      {/* ── Header Bar ─────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 16px', background: '#040814', borderBottom: '1px solid #0f172a',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ color: '#00f0ff', fontWeight: 700, fontSize: 13 }}>⊹ {cameraId}</span>
          <span style={{ color: '#94a3b8', fontSize: 11 }}>ENLARGED AI SURVEILLANCE VIEW</span>
          <span style={{
            background: yoloStatus === 'ONLINE' ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)',
            color: yoloStatus === 'ONLINE' ? '#10b981' : '#ef4444',
            padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700,
          }}>
            AI: {yoloStatus} ({yoloModel})
          </span>
          <span style={{ background: `${threatColor}20`, color: threatColor, padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>
            RISK: {threatLabel} ({threatScore}/100)
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleFullscreen}
            style={{ background: '#0f172a', border: '1px solid #38bdf8', color: '#38bdf8', padding: '4px 12px', fontSize: 10, cursor: 'pointer', borderRadius: 3, fontWeight: 700 }}
          >
            {isFullscreen ? '⊡ EXIT FULLSCREEN' : '⊞ FULLSCREEN'}
          </button>
          <button
            onClick={onClose}
            style={{ background: '#0f172a', border: '1px solid #ef4444', color: '#ef4444', padding: '4px 12px', fontSize: 10, cursor: 'pointer', borderRadius: 3, fontWeight: 700 }}
          >
            ✕ CLOSE
          </button>
        </div>
      </div>

      {/* ── Real-Time Object Counters Strip ────────────────────────────── */}
      <div style={{
        display: 'flex', gap: 1, padding: '4px 14px', background: '#040814',
        borderBottom: '1px solid #0f172a', flexShrink: 0, flexWrap: 'wrap',
      }}>
        {[
          { label: 'PERSONS', value: personCount, color: '#00f0ff' },
          { label: 'VEHICLES', value: vehicleCount, color: '#00d2ff' },
          { label: 'OBJECTS', value: objectCount, color: '#a78bfa' },
          { label: 'ACTIVE TRACKS', value: activeTracksCount, color: '#38bdf8' },
          { label: 'ACTIVE ALERTS', value: alertCount, color: alertCount > 0 ? '#ef4444' : '#10b981' },
          { label: 'INTRUSIONS', value: zoneIntrusions, color: zoneIntrusions > 0 ? '#ef4444' : '#10b981' },
          { label: 'FPS', value: fpsVal, color: '#10b981' },
          { label: 'LATENCY', value: `${latency.toFixed ? latency.toFixed(0) : latency}ms`, color: '#e2e8f0' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            background: '#070d1a', padding: '3px 14px', borderRight: '1px solid #0f172a',
          }}>
            <span style={{ fontSize: 8, color: '#64748b', letterSpacing: 1 }}>{label}</span>
            <span style={{ fontSize: 14, fontWeight: 700, color }}>{value}</span>
          </div>
        ))}
        <div style={{
          marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8,
          padding: '3px 14px', background: '#070d1a',
        }}>
          <span style={{ fontSize: 9, color: '#64748b' }}>WEAPON DETECTION:</span>
          <span style={{ fontSize: 9, color: '#fbbf24', fontWeight: 700 }}>{weaponStatus}</span>
        </div>
      </div>

      {/* ── Main Content: Enlarged Video + AI Canvas + Right Sidebar ────── */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Video + AI Bounding Box Canvas */}
        <div style={{ flex: 1, position: 'relative', background: '#000', overflow: 'hidden' }}>
          {videoStream && isCameraActive ? (
            <video
              ref={expandedVideoRef}
              autoPlay
              playsInline
              muted
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transform: 'scaleX(-1)',
              }}
            />
          ) : (
            <img
              src={cameraUrl}
              alt={cameraId}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          )}

          {/* Interactive AI Bounding Box Overlay Canvas */}
          <canvas
            ref={expandedCanvasRef}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              cursor: 'crosshair',
            }}
            onClick={(e) => {
              const canvas = expandedCanvasRef.current;
              if (!canvas) return;
              const rect = canvas.getBoundingClientRect();
              const clickX = e.clientX - rect.left;
              const clickY = e.clientY - rect.top;
              const cw = canvas.width;
              const ch = canvas.height;
              for (const obj of allObjects) {
                const [nx, ny, nw, nh] = obj.normalized_box || [0, 0, 0, 0];
                const bx = nx * cw, by = ny * ch, bw = nw * cw, bh = nh * ch;
                if (clickX >= bx && clickX <= bx + bw && clickY >= by && clickY <= by + bh) {
                  setSelectedObj(obj);
                  return;
                }
              }
              setSelectedObj(null);
            }}
          />

          {/* Active Alert Banner Overlay (if any active alert) */}
          {activeAlerts.length > 0 && (
            <div style={{
              position: 'absolute', top: 12, left: 12,
              background: 'rgba(4,8,20,0.94)', border: '1.5px solid #ef4444',
              padding: '8px 14px', borderRadius: 4, maxWidth: 420,
              pointerEvents: 'none',
            }}>
              <div style={{ color: '#ef4444', fontWeight: 700, fontSize: 11 }}>
                ⚠ ACTIVE AI ALERT: {activeAlerts[0].title}
              </div>
              <div style={{ color: '#e2e8f0', fontSize: 9, marginTop: 3 }}>
                Track: {activeAlerts[0].targetId || '--'} | Zone: {activeAlerts[0].sector || 'RESTRICTED'} | {activeAlerts[0].description || ''}
              </div>
            </div>
          )}

          {/* AI Status overlay on video bottom */}
          <div style={{
            position: 'absolute', bottom: 8, left: 8, right: 8,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            pointerEvents: 'none',
          }}>
            <div style={{
              background: 'rgba(4,8,20,0.90)', border: '1px solid rgba(0,240,255,0.3)',
              padding: '4px 10px', fontSize: 10, color: '#00f0ff',
            }}>
              {cameraId} | LIVE | AI:{yoloStatus} | MODEL:{yoloModel} | FPS:{fpsVal} | TRACKING:ACTIVE | OBJECTS:{allObjects.length}
            </div>
            <div style={{
              background: zoneIntrusions > 0 ? 'rgba(239,68,68,0.9)' : 'rgba(4,8,20,0.90)',
              border: `1px solid ${zoneIntrusions > 0 ? '#ef4444' : 'rgba(0,240,255,0.3)'}`,
              padding: '4px 10px', fontSize: 10,
              color: zoneIntrusions > 0 ? '#fff' : '#10b981',
              fontWeight: 700,
            }}>
              {zoneIntrusions > 0 ? `⚠ INTRUSIONS: ${zoneIntrusions}` : 'ZONE: CLEAR'}
            </div>
          </div>
        </div>

        {/* ── Right Sidebar: Camera AI Status + Object List + Inspection ── */}
        <div style={{
          width: 310, background: '#040814', borderLeft: '1px solid #0f172a',
          display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0,
        }}>
          {/* Camera AI Status */}
          <div style={{ padding: '10px 12px', borderBottom: '1px solid #0f172a' }}>
            <div style={{ fontSize: 10, color: '#64748b', marginBottom: 8, fontWeight: 700 }}>CAMERA AI STATUS</div>
            {[
              ['CAMERA', cameraId],
              ['STATUS', 'LIVE'],
              ['AI', yoloStatus],
              ['MODEL', `${yoloModel} (COCO-80)`],
              ['DETECTION FPS', `${fpsVal}`],
              ['TRACKING', 'ACTIVE (IOU)'],
              ['OBJECTS', allObjects.length],
              ['ALERTS', alertCount],
              ['CUSTOM OBJECT MODEL', aiTelemetry?.aiStats?.custom_object_detection || 'NOT CONFIGURED'],
              ['WEAPON DETECTION', weaponStatus],
              ['FACE RECOGNITION', 'YuNet + SFace'],
              ['ANPR', aiTelemetry?.aiStats?.anpr_status || 'STANDBY'],
            ].map(([k, v]) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3, fontSize: 9 }}>
                <span style={{ color: '#64748b' }}>{k}</span>
                <span style={{
                  color: v === 'LIVE' || v === 'ONLINE' || v === 'ACTIVE (IOU)' ? '#10b981'
                    : String(v).includes('NOT CONFIGURED') || v === 'OFFLINE' ? '#f97316'
                    : '#e2e8f0',
                  fontWeight: 600,
                }}>{v}</span>
              </div>
            ))}
          </div>

          {/* All Detected Objects List */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '8px 12px', borderBottom: '1px solid #0f172a', fontSize: 10, color: '#64748b', fontWeight: 700 }}>
              DETECTED OBJECTS [{allObjects.length}] (CLICK TO INSPECT)
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '6px 12px' }}>
              {allObjects.length === 0 ? (
                <div style={{ padding: 16, textAlign: 'center', color: '#64748b', fontSize: 10 }}>
                  No objects currently detected in optical view
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', gap: 6, padding: '3px 8px', marginBottom: 4, fontSize: 9, color: '#475569' }}>
                    <span style={{ width: 7 }} />
                    <span style={{ minWidth: 68 }}>CLASS</span>
                    <span style={{ minWidth: 46 }}>TRACK</span>
                    <span style={{ minWidth: 34 }}>CONF</span>
                    <span style={{ flex: 1, textAlign: 'right' }}>RISK</span>
                  </div>
                  {allObjects.map((obj, i) => (
                    <ObjectRow
                      key={obj.track_id || obj.target_id || `obj-${i}`}
                      obj={obj}
                      onSelect={setSelectedObj}
                      isSelected={selectedObj && (
                        (selectedObj.track_id && selectedObj.track_id === obj.track_id) ||
                        (selectedObj.target_id && selectedObj.target_id === obj.target_id)
                      )}
                    />
                  ))}
                </>
              )}
            </div>
          </div>

          {/* Object Inspection Panel (below list when object selected) */}
          {selectedObj && (
            <div style={{
              padding: '10px 12px', borderTop: `1.5px solid ${riskColor}`,
              background: `${riskColor}08`, maxHeight: 290, overflowY: 'auto',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ color: riskColor, fontWeight: 700, fontSize: 10 }}>⊹ OBJECT INSPECTION</span>
                <button
                  onClick={() => setSelectedObj(null)}
                  style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 12 }}
                >✕</button>
              </div>
              {[
                ['OBJECT', (selectedObj.class_name || selectedObj.object_type || selectedObj.class || 'OBJECT').toUpperCase()],
                ['TRACK ID', selectedObj.track_id || selectedObj.target_id || '--'],
                ['CONFIDENCE', `${(selectedObj.confidence_pct ?? selectedObj.detection_confidence ?? selectedObj.confidence ?? 0).toFixed ? (selectedObj.confidence_pct ?? selectedObj.detection_confidence ?? selectedObj.confidence ?? 0).toFixed(1) : '--'}%`],
                ['CAMERA', selectedObj.camera_id || cameraId],
                ['ACTIVITY', selectedObj.activity || selectedObj.movement || 'MONITORED'],
                ...(selectedObj.holding_status && selectedObj.holding_status !== 'NONE' ? [['OBJECT RELATION', selectedObj.holding_status]] : []),
                ['RISK STATUS', `${tag.level} (${selectedObj.risk_score ?? 10}/100)`],
                ['DIRECTION', selectedObj.direction || 'STATIONARY'],
                ['SPEED', selectedObj.relative_speed != null ? `${Number(selectedObj.relative_speed).toFixed(1)} px/s` : '0.0 px/s'],
                ['DWELL', selectedObj.dwell_seconds != null ? `${Number(selectedObj.dwell_seconds).toFixed(0)}s` : '0s'],
                ['IN ZONE', selectedObj.in_restricted_zone ? '⚠ YES — RESTRICTED' : 'NO (CLEAR)'],
                ['FACE STATUS', selectedObj.face_status || (selectedObj.face_match?.face_match ? selectedObj.face_match.display_name : 'N/A')],
                ['FIRST SEEN', selectedObj.first_seen || '--'],
                ['LAST SEEN', selectedObj.last_seen || '--'],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3, fontSize: 9 }}>
                  <span style={{ color: '#64748b' }}>{k}</span>
                  <span style={{ color: k === 'RISK STATUS' ? riskColor : k === 'ACTIVITY' ? '#00f0ff' : k === 'OBJECT RELATION' ? '#fbbf24' : '#e2e8f0', fontWeight: 600 }}>{v}</span>
                </div>
              ))}
              <div style={{
                marginTop: 8, padding: '5px 8px',
                background: `${riskColor}12`, border: `1px solid ${riskColor}40`, borderRadius: 3,
              }}>
                <div style={{ fontSize: 8, color: '#64748b' }}>AI REASON</div>
                <div style={{ fontSize: 9, color: riskColor, fontWeight: 700 }}>{tag.reason}</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
