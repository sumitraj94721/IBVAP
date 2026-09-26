import React, { useState, useEffect, useRef } from 'react';
import ExpandedCameraView from './ExpandedCameraView';

// ─── Vision Mode Definitions ─────────────────────────────────────────────────
const VISION_MODES = [
  { id: 'DAY',        label: 'DAY',                   icon: '☀' },
  { id: 'NIGHT',      label: 'NIGHT VISION',          icon: '🌙' },
  { id: 'FOG',        label: 'FOG/DEHAZE',            icon: '🌫' },
  { id: 'THERMAL',    label: 'THERMAL [SIM]',         icon: '🌡' },
  { id: 'RAIN',       label: 'RAIN ENH.',             icon: '🌧' },
  { id: 'LOWLIGHT',   label: 'LOW-LIGHT VISUAL MODE', icon: '🔅' },
  { id: 'MONO',       label: 'MONOCHROME',            icon: '⬜' },
  { id: 'ENHANCED',   label: 'ENHANCED',              icon: '✦' },
  { id: 'AIVISION',   label: 'AI VISION',             icon: '⬡' },
];

/**
 * Apply a vision mode filter to ImageData in-place.
 * All operations are pure CPU pixel math — no external deps.
 * Returns the mutated ImageData.
 */
function applyVisionFilter(imageData, mode) {
  const d = imageData.data;
  const len = d.length;
  try {
    switch (mode) {
      case 'DAY': break; // no-op

      case 'NIGHT': {
        // Green phosphor night-vision: desaturate → green tint → boost local brightness
        for (let i = 0; i < len; i += 4) {
          const lum = 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2];
          const boosted = Math.min(255, lum * 1.6 + 20);
          d[i]   = 0;
          d[i+1] = Math.min(255, boosted * 1.15);
          d[i+2] = Math.floor(boosted * 0.15);
        }
        break;
      }

      case 'FOG': {
        // CLAHE-lite: stretch contrast per channel + mild gamma correction
        let rMin=255,rMax=0,gMin=255,gMax=0,bMin=255,bMax=0;
        for (let i = 0; i < len; i += 4) {
          rMin=Math.min(rMin,d[i]); rMax=Math.max(rMax,d[i]);
          gMin=Math.min(gMin,d[i+1]); gMax=Math.max(gMax,d[i+1]);
          bMin=Math.min(bMin,d[i+2]); bMax=Math.max(bMax,d[i+2]);
        }
        const rR=Math.max(1,rMax-rMin),gR=Math.max(1,gMax-gMin),bR=Math.max(1,bMax-bMin);
        for (let i = 0; i < len; i += 4) {
          d[i]   = Math.min(255, ((d[i]   - rMin) / rR) * 255 * 1.1);
          d[i+1] = Math.min(255, ((d[i+1] - gMin) / gR) * 255 * 1.1);
          d[i+2] = Math.min(255, ((d[i+2] - bMin) / bR) * 255 * 1.1);
        }
        break;
      }

      case 'THERMAL': {
        // Luminance → false-color heatmap (black→blue→red→yellow→white)
        for (let i = 0; i < len; i += 4) {
          const lum = (0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2]) / 255;
          // Map lum to heatmap stops
          let r,g,b;
          if (lum < 0.25) {
            const t = lum / 0.25;
            r=0; g=0; b=Math.round(128 + t*127);
          } else if (lum < 0.5) {
            const t = (lum-0.25)/0.25;
            r=Math.round(t*220); g=0; b=Math.round(255-t*255);
          } else if (lum < 0.75) {
            const t = (lum-0.5)/0.25;
            r=255; g=Math.round(t*200); b=0;
          } else {
            const t = (lum-0.75)/0.25;
            r=255; g=Math.round(200+t*55); b=Math.round(t*200);
          }
          d[i]=r; d[i+1]=g; d[i+2]=b;
        }
        break;
      }

      case 'RAIN': {
        // Contrast stretch + mild warm-cool correction + sharpen-like local boost
        for (let i = 0; i < len; i += 4) {
          d[i]   = Math.min(255, d[i]   * 1.15 + 8);
          d[i+1] = Math.min(255, d[i+1] * 1.12 + 6);
          d[i+2] = Math.min(255, d[i+2] * 1.20 + 10);
        }
        break;
      }

      case 'LOWLIGHT': {
        // Gamma correction (gamma < 1 brightens dark areas) + mild sat boost
        const gamma = 0.55;
        for (let i = 0; i < len; i += 4) {
          d[i]   = Math.min(255, Math.pow(d[i]   / 255, gamma) * 255);
          d[i+1] = Math.min(255, Math.pow(d[i+1] / 255, gamma) * 255);
          d[i+2] = Math.min(255, Math.pow(d[i+2] / 255, gamma) * 255);
        }
        break;
      }

      case 'MONO': {
        for (let i = 0; i < len; i += 4) {
          const lum = Math.min(255, 0.299 * d[i] + 0.587 * d[i+1] + 0.114 * d[i+2]);
          // High-contrast mono with mild sharpening via brightness boost
          const v = Math.min(255, lum * 1.05 + 5);
          d[i]=v; d[i+1]=v; d[i+2]=v;
        }
        break;
      }

      case 'ENHANCED': {
        // CLAHE-lite + sharpening approximation
        let mn=255,mx=0;
        for (let i = 0; i < len; i += 4) {
          const lum = 0.299*d[i]+0.587*d[i+1]+0.114*d[i+2];
          mn=Math.min(mn,lum); mx=Math.max(mx,lum);
        }
        const range=Math.max(1,mx-mn);
        for (let i = 0; i < len; i += 4) {
          d[i]   = Math.min(255, ((d[i]   - mn*0.8) / range) * 255 * 1.08);
          d[i+1] = Math.min(255, ((d[i+1] - mn*0.8) / range) * 255 * 1.08);
          d[i+2] = Math.min(255, ((d[i+2] - mn*0.8) / range) * 255 * 1.08);
        }
        break;
      }

      case 'AIVISION': {
        // AI Vision: slight cold-blue tint + contrast lift to make detections pop
        for (let i = 0; i < len; i += 4) {
          d[i]   = Math.min(255, d[i]   * 0.92);
          d[i+1] = Math.min(255, d[i+1] * 0.97);
          d[i+2] = Math.min(255, d[i+2] * 1.10 + 8);
        }
        break;
      }

      default: break;
    }
  } catch (e) {
    // Filter failed — silently fall back to original
  }
  return imageData;
}

/** Return a short mode label for the HUD footer strip */
function modeHudLabel(mode) {
  const m = {
    DAY: 'OPTICAL MODE: DAY',
    NIGHT: 'NIGHT VISION ENHANCED',
    FOG: 'FOG/DEHAZE ACTIVE',
    THERMAL: 'THERMAL VISUALIZATION [SIM]',
    RAIN: 'RAIN ENH. ACTIVE',
    LOWLIGHT: 'LOW-LIGHT VISUAL MODE',
    MONO: 'MONOCHROME',
    ENHANCED: 'ENHANCED VISION',
    AIVISION: 'AI VISION MODE',
  };
  return m[mode] || mode;
}

function getEnvStatus(camId, mode) {
  switch (mode) {
    case 'NIGHT': return { env: 'NIGHT', vis: 'ENHANCED' };
    case 'FOG': return { env: 'FOG', vis: 'DEHAZE ACTIVE' };
    case 'THERMAL': return { env: 'THERMAL', vis: 'MWIR [SIM]' };
    case 'RAIN': return { env: 'RAIN', vis: 'ENHANCED' };
    case 'LOWLIGHT': return { env: 'LOW LIGHT', vis: 'LOW-LIGHT VISUAL MODE' };
    case 'MONO': return { env: 'TACTICAL', vis: 'HIGH CONTRAST' };
    case 'ENHANCED': return { env: 'OBSCURED', vis: 'CLAHE ACTIVE' };
    case 'AIVISION': return { env: 'ALL-SPECTRUM', vis: 'AI AUGMENTED' };
    default: return { env: 'CLEAR', vis: 'NOMINAL' };
  }
}

// ─── AI Risk Engine ────────────────────────────────────────────────────────────
function getRiskColor(riskLevel) {
  switch ((riskLevel || '').toUpperCase()) {
    case 'CRITICAL': return '#ef4444';
    case 'HIGH RISK':
    case 'HIGH': return '#f97316';
    case 'SUSPICIOUS EVENT':
    case 'SUSPICIOUS':
    case 'MEDIUM': return '#fbbf24';
    case 'MONITORED':
    case 'LOW': return '#38bdf8';
    case 'NORMAL': return '#10b981';
    default: return '#10b981';
  }
}

function getRiskLabel(obj) {
  if (!obj) return { level: 'NORMAL', reason: 'NORMAL OBJECT' };
  const cls = (obj.class_name || obj.object_type || obj.class || 'OBJECT').toUpperCase();
  if (obj.in_restricted_zone && obj.loitering) {
    return { level: 'CRITICAL', reason: `${cls} LOITERING IN RESTRICTED ZONE (${(obj.dwell_seconds || 0).toFixed(0)}s)` };
  }
  if (obj.in_restricted_zone || obj.inRestrictedZone) {
    return { level: 'HIGH RISK', reason: `${cls} CROSSED RESTRICTED BOUNDARY` };
  }
  if (obj.loitering) {
    return { level: 'SUSPICIOUS EVENT', reason: `LOITERING DETECTED (${(obj.dwell_seconds || 0).toFixed(0)}s)` };
  }
  const backendLevel = (obj.risk_level || obj.riskLevel || '').toUpperCase();
  const backendReason = obj.risk_reason || obj.riskReason;
  if (backendLevel) {
    return {
      level: backendLevel,
      reason: backendReason || (backendLevel === 'MONITORED' ? 'TRACKED TARGET' : 'NORMAL OBJECT'),
    };
  }
  const cat = (obj.category || '').toLowerCase();
  if (cat === 'person' || cat === 'vehicle') {
    return { level: 'MONITORED', reason: `${cls} TRACKED` };
  }
  return { level: 'NORMAL', reason: 'NORMAL OBJECT' };
}

// ─── Object Inspection Panel ──────────────────────────────────────────────────
function ObjectInspectionPanel({ obj, onClose }) {
  if (!obj) return null;
  const { level: riskLevel, reason: riskReason } = getRiskLabel(obj);
  const riskColor = getRiskColor(riskLevel);
  const isZone = obj.in_restricted_zone || obj.inRestrictedZone;
  const firstSeen = obj.first_seen || obj.firstSeen || '--';
  const lastSeen = obj.last_seen || obj.lastSeen || '--';
  const trackId = obj.track_id || obj.target_id || obj.trackId || '--';
  const conf = obj.confidence_pct ?? obj.detection_confidence ?? obj.confidence ?? 0;
  const className = (obj.class_name || obj.object_type || obj.class || 'OBJECT').toUpperCase();
  const camId = obj.camera_id || 'CAM-01';
  const direction = obj.direction || 'STATIONARY';
  const speed = obj.relative_speed != null ? `${Number(obj.relative_speed).toFixed(1)} px/s` : '0.0 px/s';
  const faceStatus = obj.face_status || (obj.category === 'person' ? 'NO FACE VISIBLE' : 'N/A');
  const activity = obj.activity || obj.movement || 'MONITORED';
  const holdingStatus = obj.holding_status || 'NONE';
  const riskScore = obj.risk_score ?? (isZone ? 75 : 12);
  const behavioralSignals = obj.behavioral_signals || [];

  return (
    <div style={{
      position: 'fixed', bottom: 20, right: 20, zIndex: 9999,
      background: '#040814', border: `1.5px solid ${riskColor}`,
      borderRadius: 6, padding: '14px 18px', minWidth: 310, maxWidth: 380,
      boxShadow: `0 4px 30px ${riskColor}33, 0 2px 10px rgba(0,0,0,0.8)`,
      fontFamily: "'JetBrains Mono', monospace",
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ color: riskColor, fontWeight: 700, fontSize: 11, letterSpacing: 1 }}>⊹ IBVAP OBJECT & ACTIVITY INSPECTION</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 14 }}>✕</button>
      </div>
      {[
        { label: 'OBJECT', value: className, color: riskColor, bold: true },
        { label: 'TRACK ID', value: trackId, bold: true },
        { label: 'CONFIDENCE', value: `${typeof conf === 'number' ? conf.toFixed(1) : conf}%` },
        { label: 'CAMERA', value: camId },
        { label: 'ACTIVITY', value: activity, color: '#00f0ff', bold: true },
        ...(holdingStatus && holdingStatus !== 'NONE' ? [{ label: 'OBJECT RELATION', value: holdingStatus, color: '#fbbf24', bold: true }] : []),
        { label: 'RISK STATUS', value: `${riskLevel} (${riskScore}/100)`, color: riskColor, bold: true },
        { label: 'DIRECTION', value: direction },
        { label: 'SPEED', value: speed },
        { label: 'ZONE', value: isZone ? '⚠ RESTRICTED [BORDER ZONE A]' : 'UNRESTRICTED / CLEAR', color: isZone ? '#ef4444' : '#10b981' },
        ...(obj.category === 'person' ? [{ label: 'FACE STATUS', value: faceStatus }] : []),
        ...(obj.plate && obj.plate !== 'N/A' ? [{ label: 'ANPR PLATE', value: obj.plate, color: '#f59e0b', bold: true }] : []),
        { label: 'FIRST SEEN', value: firstSeen },
        { label: 'LAST SEEN', value: lastSeen },
      ].map(({ label, value, color, bold }) => (
        <div key={label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 10, gap: 8 }}>
          <span style={{ color: '#64748b' }}>{label}</span>
          <span style={{ color: color || '#e2e8f0', fontWeight: bold ? 700 : 400, textAlign: 'right' }}>{value}</span>
        </div>
      ))}
      {behavioralSignals.length > 0 && (
        <div style={{ marginTop: 6, padding: '5px 8px', background: 'rgba(0, 240, 255, 0.06)', border: '1px solid rgba(0, 240, 255, 0.25)', borderRadius: 3 }}>
          <div style={{ fontSize: 8.5, color: '#38bdf8', fontWeight: 700, marginBottom: 2 }}>OBSERVABLE BEHAVIORAL SIGNALS:</div>
          {behavioralSignals.slice(0, 3).map((sig, i) => (
            <div key={i} style={{ fontSize: 8.5, color: '#cbd5e1' }}>• {sig}</div>
          ))}
        </div>
      )}
      <div style={{ marginTop: 8, padding: '6px 8px', background: `${riskColor}15`, border: `1px solid ${riskColor}40`, borderRadius: 3 }}>
        <span style={{ fontSize: 9, color: '#64748b' }}>EXPLAINABLE AI REASON: </span>
        <span style={{ fontSize: 9, color: riskColor, fontWeight: 700 }}>{riskReason}</span>
      </div>
    </div>
  );
}

// ─── AI Issue Panel (on-screen security event) ────────────────────────────────
function AiIssuePanel({ alert, onDismiss }) {
  if (!alert) return null;
  const sev = (alert.severity || 'HIGH').toUpperCase();
  const sevColor = sev === 'CRITICAL' ? '#ef4444' : sev === 'HIGH' ? '#f97316' : sev === 'MEDIUM' ? '#fbbf24' : '#38bdf8';
  const trackId = alert.targetId || alert.track_id || '--';
  const objType = trackId.startsWith('V-') ? 'VEHICLE' : trackId.startsWith('O-') ? 'OBJECT' : 'PERSON';
  return (
    <div style={{
      position: 'absolute', top: 44, left: '50%', transform: 'translateX(-50%)',
      zIndex: 100, background: 'rgba(4,8,20,0.97)', border: `2px solid ${sevColor}`,
      borderRadius: 6, padding: '10px 16px', minWidth: 300, maxWidth: 400,
      boxShadow: `0 0 30px ${sevColor}55`, fontFamily: "'JetBrains Mono', monospace",
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ color: sevColor, fontWeight: 700, fontSize: 11 }}>⚠ {sev} RISK EVENT</span>
        <button onClick={onDismiss} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 13 }}>✕</button>
      </div>
      <div style={{ color: '#e2e8f0', fontWeight: 700, fontSize: 10, marginBottom: 6 }}>{alert.title}</div>
      {[
        ['Camera', alert.camera || 'CAM-01'],
        ['Object', objType],
        ['Track', trackId],
        ['Confidence', alert.confidence ? `${alert.confidence}%` : '--'],
        ['Zone', alert.sector || 'RESTRICTED'],
      ].map(([k, v]) => (
        <div key={k} style={{ display: 'flex', gap: 8, fontSize: 9, marginBottom: 2 }}>
          <span style={{ color: '#64748b', minWidth: 75 }}>{k}:</span>
          <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{v}</span>
        </div>
      ))}
      {alert.description && (
        <div style={{ marginTop: 6, padding: '4px 8px', background: `${sevColor}12`, border: `1px solid ${sevColor}40`, borderRadius: 3, fontSize: 9, color: sevColor }}>
          Reason: {alert.description}
        </div>
      )}
    </div>
  );
}

export default function LiveSurveillanceGrid({ cameras, alerts, onAiUpdate, onOpenPTZ, onTakeSnapshot }) {
  // Camera Ingestion & Device State
  const [videoDevices, setVideoDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [maximizedCam, setMaximizedCam] = useState(null);
  const [cam2Status, setCam2Status] = useState({
    connected: false,
    stream_status: 'OFFLINE',
    fps: 0,
    resolution: null,
    latency_ms: null,
  });

  // Per-camera vision mode state (independent)
  const [visionModes, setVisionModes] = useState({
    'CAM-01': 'DAY',
    'CAM-02': 'NIGHT',
    'CAM-03': 'THERMAL',
    'CAM-04': 'DAY',
  });

  // Automatic mode recommendation heuristic
  const [autoSuggestedMode, setAutoSuggestedMode] = useState(null);

  const setMode = (camId, mode) =>
    setVisionModes((prev) => ({ ...prev, [camId]: mode }));

  // Preset tactical demo scenarios
  const applyScenario = (scenarioId) => {
    switch (scenarioId) {
      case 'NORMAL_DAY':
        setVisionModes({ 'CAM-01': 'DAY', 'CAM-02': 'DAY', 'CAM-03': 'DAY', 'CAM-04': 'DAY' });
        break;
      case 'NIGHT_PATROL':
        setVisionModes({ 'CAM-01': 'NIGHT', 'CAM-02': 'NIGHT', 'CAM-03': 'THERMAL', 'CAM-04': 'LOWLIGHT' });
        break;
      case 'FOG_OPERATION':
        setVisionModes({ 'CAM-01': 'FOG', 'CAM-02': 'FOG', 'CAM-03': 'THERMAL', 'CAM-04': 'ENHANCED' });
        break;
      case 'THERMAL_SEARCH':
        setVisionModes({ 'CAM-01': 'THERMAL', 'CAM-02': 'THERMAL', 'CAM-03': 'THERMAL', 'CAM-04': 'NIGHT' });
        break;
      case 'LOW_VISIBILITY':
        setVisionModes({ 'CAM-01': 'ENHANCED', 'CAM-02': 'FOG', 'CAM-03': 'LOWLIGHT', 'CAM-04': 'RAIN' });
        break;
      case 'AI_OVERWATCH':
        setVisionModes({ 'CAM-01': 'AIVISION', 'CAM-02': 'AIVISION', 'CAM-03': 'THERMAL', 'CAM-04': 'AIVISION' });
        break;
      default:
        break;
    }
  };

  // WebSocket & AI Telemetry State
  const [isWsConnected, setIsWsConnected] = useState(false);
  const [aiTelemetry, setAiTelemetry] = useState({
    latencyMs: 0,
    targets: [],
    faces: [],
    vehicles: [],
    totalFaces: 0,
    highThreats: 0,
    objects: [],
    odPersons: [],
    odVehicles: [],
    aiAlerts: [],
    aiEvents: [],
    threatScore: 0,
    contributingSignals: [],
    threatReasons: [],
    zoneIntrusions: 0,
    loiteringCount: 0,
    aiStats: {},
    otherObjects: [],
    relationships: [],
    personActivityCards: [],
    fusion: null,
  });

  // Multi-camera Incident Fusion state (populated from /ws/stream or /api/incidents/fusion)
  const [fusionState, setFusionState] = useState(null);
  const [isTriggeringDemo, setIsTriggeringDemo] = useState(false);

  const [inspectedObject, setInspectedObject] = useState(null);
  const [activeIssueAlert, setActiveIssueAlert] = useState(null);
  const [expandedCam, setExpandedCam] = useState(null); // { id, url } | null
  const activeIssueTimerRef = useRef(null);

  const videoRef = useRef(null);
  const overlayCanvasRef = useRef(null);
  const filterCanvasRef = useRef(null);   // NEW: CAM-01 vision filter display canvas
  const offscreenCanvasRef = useRef(null);
  const websocketRef = useRef(null);
  const isProcessingFrameRef = useRef(false);
  const streamRef = useRef(null);
  const visionModesRef = useRef(visionModes);
  const frameCounterRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const refreshCam2Status = async () => {
      try {
        const response = await fetch('/api/cameras/cam2/status');
        const status = await response.json();
        if (!cancelled) setCam2Status(status);
      } catch (_) {
        if (!cancelled) setCam2Status((previous) => ({ ...previous, connected: false, stream_status: 'OFFLINE' }));
      }
    };

    refreshCam2Status();
    const statusInterval = setInterval(refreshCam2Status, 2000);
    return () => {
      cancelled = true;
      clearInterval(statusInterval);
    };
  }, []);

  // Keep ref in sync so animation loops see latest mode without stale closure
  useEffect(() => { visionModesRef.current = visionModes; }, [visionModes]);

  // References for CAM-02, CAM-03, CAM-04 simulation canvases
  const canvasRefs = {
    'CAM-01': useRef(null), // fallback simulation canvas if webcam denied
    'CAM-02': useRef(null),
    'CAM-03': useRef(null),
    'CAM-04': useRef(null),
  };


  // -----------------------------------------------------------------
  // 1. Enumerate Available Cameras
  // -----------------------------------------------------------------
  useEffect(() => {
    const enumerateCameras = async () => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
          setCameraError('Browser MediaDevices API not supported on this client.');
          return;
        }

        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoInputs = devices.filter((d) => d.kind === 'videoinput');
        setVideoDevices(videoInputs);

        if (videoInputs.length > 0 && !selectedDeviceId) {
          setSelectedDeviceId(videoInputs[0].deviceId);
        }
      } catch (err) {
        console.warn('[IBVAP] Could not enumerate camera devices:', err);
      }
    };

    enumerateCameras();

    navigator.mediaDevices?.addEventListener('devicechange', enumerateCameras);
    return () => {
      navigator.mediaDevices?.removeEventListener('devicechange', enumerateCameras);
    };
  }, []);

  // -----------------------------------------------------------------
  // 2. Start / Switch Real Camera Stream
  // -----------------------------------------------------------------
  useEffect(() => {
    let isCancelled = false;

    const startCamera = async () => {
      // Stop previous tracks if any
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }

      const constraints = {
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
          ...(selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : {}),
        },
        audio: false,
      };

      try {
        setCameraError('');
        const stream = await navigator.mediaDevices.getUserMedia(constraints);

        if (isCancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;

        // Attach stream to video element immediately if ref is available
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
        setIsCameraActive(true);

        // Update device list if labels were populated after permission grant
        if (navigator.mediaDevices.enumerateDevices) {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoInputs = devices.filter((d) => d.kind === 'videoinput');
          setVideoDevices(videoInputs);
        }
      } catch (err) {
        if (isCancelled) return;
        console.warn('[IBVAP] Camera access error:', err);
        setIsCameraActive(false);
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setCameraError('Camera access permission denied in browser. Running in simulated optical mode.');
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          setCameraError('No physical optical camera detected. Running in simulated optical mode.');
        } else {
          setCameraError(`Camera Error: ${err.message || 'Unable to open camera'}`);
        }
      }
    };

    startCamera();

    return () => {
      isCancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, [selectedDeviceId]);

  // Keep video.srcObject in sync when isCameraActive changes
  useEffect(() => {
    if (videoRef.current && streamRef.current && isCameraActive) {
      if (videoRef.current.srcObject !== streamRef.current) {
        videoRef.current.srcObject = streamRef.current;
      }
      videoRef.current.play().catch(() => {});
    }
  }, [isCameraActive]);

  // -----------------------------------------------------------------
  // 3. Connect to FastAPI WebSocket (/ws/stream)
  // -----------------------------------------------------------------
  useEffect(() => {
    let ws = null;
    let reconnectTimeout = null;
    let isUnmounted = false;

    const connectWebSocket = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host || 'localhost:5176';
      const wsUrl = `${protocol}//${host}/ws/stream`;

      try {
        ws = new WebSocket(wsUrl);
        websocketRef.current = ws;

        ws.onopen = () => {
          if (isUnmounted) return;
          setIsWsConnected(true);
          console.log('[IBVAP] Connected to FastAPI AI vision WebSocket:', wsUrl);
        };

        ws.onmessage = (event) => {
          if (isUnmounted) return;
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'telemetry') {
              const updated = {
                latencyMs: data.latency_ms || 0,
                targets: data.targets || [],
                faces: data.faces || [],
                vehicles: data.vehicles || [],
                tracks: data.tracks || [],
                faceMatches: data.face_matches || [],
                anprEvents: data.anpr_events || [],
                totalFaces: data.total_faces || (data.targets?.length || 0),
                highThreats: data.high_threat_count || 0,
                // Multi-object & activity AI fields
                objects: data.objects || [],
                odPersons: data.od_persons || [],
                odVehicles: data.od_vehicles || [],
                aiAlerts: data.ai_alerts || [],
                aiEvents: data.ai_events || [],
                threatScore: data.threat_score || 0,
                contributingSignals: data.contributing_signals || [],
                threatReasons: data.threat_reasons || [],
                zoneIntrusions: data.zone_intrusions || 0,
                loiteringCount: data.loitering_count || 0,
                aiStats: data.ai_stats || {},
                otherObjects: data.other_objects || [],
                relationships: data.relationships || [],
                personActivityCards: data.person_activity_cards || [],
                fusion: data.fusion || null,
              };
              setAiTelemetry(updated);
              if (data.fusion) {
                setFusionState(data.fusion);
              }
              // Notify parent (App.jsx) with AI data for alerts/analytics
              if (onAiUpdate) onAiUpdate(updated);
              // Show on-screen AI issue panel for high-priority alerts
              const criticalAlerts = (updated.aiAlerts || []).filter(
                a => a.severity === 'CRITICAL' || a.severity === 'HIGH'
              );
              if (criticalAlerts.length > 0) {
                setActiveIssueAlert(criticalAlerts[0]);
                if (activeIssueTimerRef.current) clearTimeout(activeIssueTimerRef.current);
                activeIssueTimerRef.current = setTimeout(() => setActiveIssueAlert(null), 8000);
              }
            }
          } catch (e) {
            console.warn('[IBVAP] WS telemetry parse error:', e);
          } finally {
            isProcessingFrameRef.current = false;
          }
        };

        ws.onerror = () => {
          isProcessingFrameRef.current = false;
        };

        ws.onclose = () => {
          if (isUnmounted) return;
          setIsWsConnected(false);
          isProcessingFrameRef.current = false;
          reconnectTimeout = setTimeout(connectWebSocket, 2000);
        };
      } catch (e) {
        reconnectTimeout = setTimeout(connectWebSocket, 2000);
      }
    };

    connectWebSocket();

    return () => {
      isUnmounted = true;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (websocketRef.current) {
        websocketRef.current.close();
      }
    };
  }, []);

  // Fetch initial Multi-Camera Incident Fusion summary so panel works immediately
  useEffect(() => {
    let cancelled = false;
    const loadInitialFusion = async () => {
      try {
        const res = await fetch('/api/incidents/fusion');
        if (res.ok) {
          const json = await res.json();
          if (!cancelled) setFusionState(json);
        }
      } catch (_) {}
    };
    loadInitialFusion();
    return () => { cancelled = true; };
  }, []);

  // Trigger SIH Judge Multi-Camera Correlation Demo (CAM-01 Normal, CAM-02/03/04 Correlated)
  const handleTriggerSihDemoFusion = async () => {
    setIsTriggeringDemo(true);
    try {
      const res = await fetch('/api/incidents/demo-fusion', { method: 'POST' });
      if (res.ok) {
        const demoData = await res.json();
        const refreshRes = await fetch('/api/incidents/fusion');
        const fullFusion = refreshRes.ok ? await refreshRes.json() : null;
        if (fullFusion) {
          setFusionState(fullFusion);
        }
        if (demoData.alert && onAiUpdate) {
          onAiUpdate({
            ...aiTelemetry,
            aiAlerts: [demoData.alert, ...(aiTelemetry.aiAlerts || [])],
            fusion: fullFusion || fusionState,
          });
          setActiveIssueAlert(demoData.alert);
          if (activeIssueTimerRef.current) clearTimeout(activeIssueTimerRef.current);
          activeIssueTimerRef.current = setTimeout(() => setActiveIssueAlert(null), 9000);
        }
      }
    } catch (e) {
      console.warn('[IBVAP] SIH Demo Fusion trigger error:', e);
    } finally {
      setIsTriggeringDemo(false);
    }
  };

  const handleClearPriorityCamera = async () => {
    try {
      const res = await fetch('/api/incidents/clear-priority', { method: 'POST' });
      if (res.ok) {
        const updatedFusion = await res.json();
        setFusionState(updatedFusion);
      }
    } catch (_) {
      setFusionState((prev) => (prev ? { ...prev, priority_camera: null, priority_reason: null } : prev));
    }
  };

  // -----------------------------------------------------------------
  // 4. Capture & Send Camera Frames to FastAPI Backend
  // -----------------------------------------------------------------
  useEffect(() => {
    if (!offscreenCanvasRef.current) {
      offscreenCanvasRef.current = document.createElement('canvas');
    }

    const frameInterval = setInterval(() => {
      const video = videoRef.current;
      const ws = websocketRef.current;

      if (
        !video ||
        !isCameraActive ||
        video.videoWidth === 0 ||
        video.videoHeight === 0 ||
        !ws ||
        ws.readyState !== WebSocket.OPEN ||
        isProcessingFrameRef.current
      ) {
        return;
      }

      try {
        isProcessingFrameRef.current = true;

        // Auto-release guard: don't lock if backend doesn't respond
        setTimeout(() => {
          isProcessingFrameRef.current = false;
        }, 120);

        const offCanvas = offscreenCanvasRef.current;
        const targetWidth = 640;
        const aspect = video.videoHeight / video.videoWidth;
        const targetHeight = Math.round(targetWidth * aspect) || 360;

        if (offCanvas.width !== targetWidth || offCanvas.height !== targetHeight) {
          offCanvas.width = targetWidth;
          offCanvas.height = targetHeight;
        }

        const ctx = offCanvas.getContext('2d');
        // Mirror image horizontally to match mirrored camera view
        ctx.save();
        ctx.translate(targetWidth, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, 0, 0, targetWidth, targetHeight);
        ctx.restore();

        // Sample light & contrast every 25 frames (~1s) for automatic mode recommendation
        frameCounterRef.current = (frameCounterRef.current || 0) + 1;
        if (frameCounterRef.current % 25 === 0) {
          try {
            const sample = ctx.getImageData(Math.floor(targetWidth / 2 - 10), Math.floor(targetHeight / 2 - 10), 20, 20).data;
            let sumL = 0, minL = 255, maxL = 0;
            for (let i = 0; i < sample.length; i += 4) {
              const lum = 0.299 * sample[i] + 0.587 * sample[i + 1] + 0.114 * sample[i + 2];
              sumL += lum;
              if (lum < minL) minL = lum;
              if (lum > maxL) maxL = lum;
            }
            const avgL = sumL / (sample.length / 4);
            const contrast = maxL - minL;
            if (avgL < 45) {
              setAutoSuggestedMode('LOWLIGHT');
            } else if (contrast < 35 && avgL > 60) {
              setAutoSuggestedMode('FOG');
            } else {
              setAutoSuggestedMode('DAY');
            }
          } catch (_) {}
        }

        const jpegData = offCanvas.toDataURL('image/jpeg', 0.65);

        ws.send(
          JSON.stringify({
            type: 'frame',
            image: jpegData,
            confidence_threshold: 0.5,
            engine: 'yunet',
          })
        );
      } catch (err) {
        isProcessingFrameRef.current = false;
      }
    }, 40); // ~25 FPS frame transmission rate

    return () => clearInterval(frameInterval);
  }, [isCameraActive]);

  // -----------------------------------------------------------------
  // 4b. CAM-01 Vision Filter Rendering Loop
  //     Captures video → applies pixel filter → draws to filterCanvasRef
  //     Runs separately from AI pipeline (AI always gets clean frames)
  //     Frame rate throttled to ~30 FPS. Falls back to DAY on any error.
  // -----------------------------------------------------------------
  useEffect(() => {
    if (!isCameraActive) return;
    let animId;

    const renderFilteredFrame = () => {
      const video = videoRef.current;
      const canvas = filterCanvasRef.current;
      const mode = visionModesRef.current['CAM-01'] || 'DAY';

      if (canvas && video && video.videoWidth > 0) {
        try {
          const vw = video.clientWidth || video.videoWidth;
          const vh = video.clientHeight || video.videoHeight;

          if (canvas.width !== vw || canvas.height !== vh) {
            canvas.width = vw;
            canvas.height = vh;
          }

          const ctx = canvas.getContext('2d', { willReadFrequently: true });

          if (mode === 'DAY') {
            // DAY mode: hide filter canvas, native video shows through
            canvas.style.display = 'none';
          } else {
            canvas.style.display = 'block';
            // Draw mirrored video frame
            ctx.save();
            ctx.translate(vw, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(video, 0, 0, vw, vh);
            ctx.restore();

            // Apply vision filter in-place
            if (vw > 0 && vh > 0) {
              const imgData = ctx.getImageData(0, 0, vw, vh);
              applyVisionFilter(imgData, mode);
              ctx.putImageData(imgData, 0, 0);
            }

            // Draw mode badge top-left
            const badge = modeHudLabel(mode);
            ctx.fillStyle = 'rgba(4, 7, 18, 0.82)';
            ctx.fillRect(4, 4, 220, 18);
            ctx.strokeStyle = mode === 'NIGHT' ? '#10b981'
              : mode === 'THERMAL' ? '#ef4444'
              : mode === 'FOG' ? '#38bdf8'
              : '#00f0ff';
            ctx.lineWidth = 1;
            ctx.strokeRect(4, 4, 220, 18);
            ctx.fillStyle = ctx.strokeStyle;
            ctx.font = "bold 9px 'JetBrains Mono', monospace";
            ctx.fillText(`◈ ${badge}`, 10, 16);
          }
        } catch (err) {
          // Filter error — hide canvas, native video fallback
          if (filterCanvasRef.current) filterCanvasRef.current.style.display = 'none';
        }
      }

      animId = requestAnimationFrame(renderFilteredFrame);
    };

    animId = requestAnimationFrame(renderFilteredFrame);
    return () => cancelAnimationFrame(animId);
  }, [isCameraActive]);


  // -----------------------------------------------------------------
  // 5. Render HUD Tactical Overlays on Video Canvas
  // -----------------------------------------------------------------
  useEffect(() => {
    let animId;

    const renderCornerReticles = (ctx, x, y, w, h, color) => {
      const cornerLen = Math.min(22, Math.max(8, w * 0.22));
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'square';
      ctx.beginPath();
      ctx.moveTo(x, y + cornerLen); ctx.lineTo(x, y); ctx.lineTo(x + cornerLen, y);
      ctx.moveTo(x + w - cornerLen, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + cornerLen);
      ctx.moveTo(x, y + h - cornerLen); ctx.lineTo(x, y + h); ctx.lineTo(x + cornerLen, y + h);
      ctx.moveTo(x + w - cornerLen, y + h); ctx.lineTo(x + w, y + h); ctx.lineTo(x + w, y + h - cornerLen);
      ctx.stroke();
    };

    const renderOverlay = () => {
      const canvas = overlayCanvasRef.current;
      const video = videoRef.current;

      if (canvas && video && isCameraActive) {
        const vw = video.clientWidth || 480;
        const vh = video.clientHeight || 270;

        if (canvas.width !== vw || canvas.height !== vh) {
          canvas.width = vw;
          canvas.height = vh;
        }

        const ctx = canvas.getContext('2d');
        const cw = canvas.width;
        const ch = canvas.height;
        ctx.clearRect(0, 0, cw, ch);

        // ── PERSON / FACE TARGETS from FastAPI ────────────────────────────
        if (aiTelemetry.targets && aiTelemetry.targets.length > 0) {
          aiTelemetry.targets.forEach((target) => {
            const [nx, ny, nw, nh] = target.normalized_box || [0, 0, 0, 0];
            const x = nx * cw;
            const y = ny * ch;
            const w = nw * cw;
            const h = nh * ch;

            const emotion = target.emotion || {};
            const conf = target.detection_confidence || emotion.confidence || 0;
            const targetId = target.target_id || 'P-001';
            const activity = target.activity || target.movement || 'STANDING';
            const holdingStatus = target.holding_status || 'NONE';
            const direction = target.direction || '';
            const inZone = target.in_restricted_zone || false;
            const loitering = target.loitering || false;
            const dwell = target.dwell_seconds || 0;
            const pScore = target.risk_score ?? aiTelemetry.threatScore ?? 10;

            // Color by zone/risk status ONLY (never facial expression per Section 8)
            let themeColor = '#10b981'; // green = nominal
            if (loitering || pScore >= 75) themeColor = '#ef4444';       // red = critical/loitering
            else if (inZone || pScore >= 50) themeColor = '#fbbf24';     // amber = intrusion/high

            // Intrusion zone flash overlay
            if (inZone) {
              ctx.fillStyle = loitering
                ? 'rgba(239, 68, 68, 0.12)'
                : 'rgba(251, 191, 36, 0.08)';
              ctx.fillRect(x, y, w, h);
            } else {
              ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
              ctx.fillRect(x, y, w, h);
            }

            // Corner reticles
            renderCornerReticles(ctx, x, y, w, h, themeColor);

            // Dashed perimeter
            ctx.strokeStyle = themeColor;
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.strokeRect(x, y, w, h);
            ctx.setLineDash([]);

            // Center crosshair
            const cx2 = x + w / 2;
            const cy2 = y + h / 2;
            ctx.beginPath();
            ctx.moveTo(cx2 - 6, cy2); ctx.lineTo(cx2 + 6, cy2);
            ctx.moveTo(cx2, cy2 - 6); ctx.lineTo(cx2, cy2 + 6);
            ctx.stroke();

            // ── HUD info panel (right of bbox or above) ────────────────
            const panelW = 198;
            const panelX = Math.min(x, cw - panelW - 2);
            const panelY = Math.max(4, y - 4);
            const lines = [];
            const { level: pRiskLevel } = getRiskLabel(target);
            const pRiskColor = getRiskColor(pRiskLevel);

            // Line 1: Target ID + type + confidence
            lines.push({ text: `PERSON ${targetId} (${conf.toFixed(0)}%)`, color: themeColor, bold: true });
            // Line 2: Activity Understanding
            lines.push({ text: `ACTIVITY: ${activity}`, color: '#00f0ff', bold: true });
            // Line 3: Holding / Carrying or Object Near Person (Spatial-Temporal confirmed)
            if (holdingStatus && holdingStatus !== 'NONE') {
              lines.push({ text: holdingStatus, color: '#fbbf24', bold: true });
            }
            // Line 4: Risk Status + Explainable Score
            lines.push({ text: `RISK: ${pRiskLevel} (${pScore}/100)`, color: pRiskColor, bold: true });
            // Line 5: Face visibility / match outcome (honest terminology)
            const fm = target.face_match;
            if (fm && fm.face_match && fm.display_name && fm.display_name !== 'UNKNOWN') {
              lines.push({ text: `KNOWN: ${fm.display_name} (${(fm.similarity * 100).toFixed(0)}%)`, color: '#10b981', bold: true });
            } else if (target.has_face) {
              lines.push({ text: `FACE DETECTED: UNKNOWN`, color: '#fbbf24' });
            } else {
              lines.push({ text: `FACE: NOT VISIBLE`, color: '#94a3b8' });
            }
            // Line 6: Movement direction and estimated relative speed
            const speedVal = target.relative_speed ? `${target.relative_speed.toFixed(1)} px/s [EST]` : '0.0 px/s';
            lines.push({ text: `${direction || 'STATIONARY'} ▶ ${speedVal}`, color: '#38bdf8' });
            // Line 7: Zone & Loitering
            if (loitering) {
              lines.push({ text: `⚠ LOITERING ${dwell.toFixed(0)}s`, color: '#ef4444', bold: true });
            } else if (inZone) {
              lines.push({ text: `⚠ RESTRICTED ZONE [ALPHA]`, color: '#fbbf24', bold: true });
            }

            // Draw panel background
            const lineH = 13;
            const panelH = lines.length * lineH + 8;
            ctx.fillStyle = 'rgba(4, 7, 18, 0.90)';
            ctx.fillRect(panelX, panelY - panelH, panelW, panelH);
            ctx.strokeStyle = themeColor;
            ctx.lineWidth = 1;
            ctx.strokeRect(panelX, panelY - panelH, panelW, panelH);

            // Draw text lines (bottom-up from panelY)
            lines.reverse().forEach((line, i) => {
              ctx.fillStyle = line.color || '#e2e8f0';
              ctx.font = `${line.bold ? 'bold ' : ''}9px 'JetBrains Mono', monospace`;
              ctx.fillText(line.text, panelX + 5, panelY - 5 - i * lineH);
            });

            // Facial landmarks
            if (target.landmarks && target.landmarks.length > 0) {
              ctx.fillStyle = '#00f0ff';
              target.landmarks.forEach(([lx, ly]) => {
                const rx = (lx / 640) * cw;
                const ry = (ly / 360) * ch;
                ctx.beginPath();
                ctx.arc(rx, ry, 2.5, 0, Math.PI * 2);
                ctx.fill();
              });
            }
          });
        }

        // ── VEHICLE DETECTIONS & TRACKS (from YOLO + Tracker) ────────────
        const vehicleList = (aiTelemetry.vehicles && aiTelemetry.vehicles.length > 0)
          ? aiTelemetry.vehicles
          : (aiTelemetry.odVehicles || []);

        if (vehicleList.length > 0) {
          vehicleList.forEach((veh) => {
            const [nx, ny, nw, nh] = veh.normalized_box || [0, 0, 0, 0];
            const x = nx * cw;
            const y = ny * ch;
            const w = nw * cw;
            const h = nh * ch;
            const vname = (veh.object_type || veh.class_name || 'CAR').toUpperCase();
            const vtrack = veh.track_id || 'V-001';
            const vconf = veh.confidence || 0;
            const vplate = veh.plate && veh.plate !== 'N/A' ? veh.plate : null;
            const vspeed = veh.relative_speed ? `${veh.relative_speed.toFixed(1)} px/s` : '0.0 px/s';
            const { level: vRiskLevel } = getRiskLabel(veh);
            const vRiskColor = getRiskColor(vRiskLevel);

            ctx.fillStyle = veh.in_restricted_zone ? 'rgba(239, 68, 68, 0.12)' : 'rgba(0, 210, 255, 0.08)';
            ctx.fillRect(x, y, w, h);
            renderCornerReticles(ctx, x, y, w, h, veh.in_restricted_zone ? '#ef4444' : '#00d2ff');
            ctx.strokeStyle = veh.in_restricted_zone ? '#ef4444' : '#00d2ff';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([6, 3]);
            ctx.strokeRect(x, y, w, h);
            ctx.setLineDash([]);

            // Vehicle HUD info card
            const vLines = [
              { text: `${vname} ${vtrack} (${vconf.toFixed(0)}%)`, color: '#00d2ff', bold: true },
              { text: `RISK: ${vRiskLevel}`, color: vRiskColor, bold: true },
            ];
            if (vplate) {
              vLines.push({ text: `PLATE: ${vplate}`, color: '#f59e0b', bold: true });
            }
            if (veh.direction) {
              vLines.push({ text: `${veh.direction} ▶ ${vspeed}`, color: '#38bdf8' });
            }
            if (veh.in_restricted_zone) {
              vLines.push({ text: `⚠ RESTRICTED ZONE`, color: '#ef4444', bold: true });
            }

            const vlH = 13;
            const vpH = vLines.length * vlH + 6;
            const vpW = 160;
            const vpX = Math.min(x, cw - vpW);
            const vpY = Math.max(2, y - 4);

            ctx.fillStyle = 'rgba(4, 7, 18, 0.90)';
            ctx.fillRect(vpX, vpY - vpH, vpW, vpH);
            ctx.strokeStyle = veh.in_restricted_zone ? '#ef4444' : '#00d2ff';
            ctx.lineWidth = 1;
            ctx.strokeRect(vpX, vpY - vpH, vpW, vpH);

            vLines.reverse().forEach((vl, vi) => {
              ctx.fillStyle = vl.color || '#e2e8f0';
              ctx.font = `${vl.bold ? 'bold ' : ''}9px 'JetBrains Mono', monospace`;
              ctx.fillText(vl.text, vpX + 5, vpY - 4 - vi * vlH);
            });
          });
        }

        // ── OBJECT DETECTIONS (All non-person/non-vehicle COCO classes) ───────
        const otherObjects = aiTelemetry.otherObjects || aiTelemetry.other_objects || aiTelemetry.objects || [];
        if (otherObjects.length > 0) {
          otherObjects.forEach((obj) => {
            if (obj.category === 'person' || obj.category === 'vehicle') return;
            const [nx, ny, nw, nh] = obj.normalized_box || [0, 0, 0, 0];
            const x = nx * cw;
            const y = ny * ch;
            const w = nw * cw;
            const h = nh * ch;
            if (w < 2 || h < 2) return;
            const oname = (obj.class_name || obj.class || 'OBJECT').toUpperCase();
            const otrack = obj.track_id || obj.target_id || '';
            const oconf = obj.confidence_pct ?? obj.confidence ?? 0;
            const { level: oRisk } = getRiskLabel(obj);
            const riskClr = getRiskColor(oRisk);

            ctx.fillStyle = 'rgba(16, 185, 129, 0.05)';
            ctx.fillRect(x, y, w, h);
            renderCornerReticles(ctx, x, y, w, h, riskClr);
            ctx.strokeStyle = riskClr;
            ctx.lineWidth = 1.2;
            ctx.setLineDash([3, 3]);
            ctx.strokeRect(x, y, w, h);
            ctx.setLineDash([]);

            // Label box: OBJECT_NAME TRACK_ID CONF% | RISK
            const confStr = `${typeof oconf === 'number' ? oconf.toFixed(0) : oconf}%`;
            const labelText = `${oname} ${otrack} ${confStr} | ${oRisk}`;
            const lw = Math.max(labelText.length * 5.8 + 10, 110);
            const lx = Math.min(x, cw - lw - 2);
            const ly = Math.max(2, y - 18);
            ctx.fillStyle = 'rgba(4, 7, 18, 0.90)';
            ctx.fillRect(lx, ly, lw, 16);
            ctx.strokeStyle = riskClr;
            ctx.lineWidth = 1;
            ctx.strokeRect(lx, ly, lw, 16);
            ctx.fillStyle = riskClr;
            ctx.font = "bold 9px 'JetBrains Mono', monospace";
            ctx.fillText(labelText, lx + 4, ly + 11);
          });
        }

        // ── GLOBAL AI THREAT SCORE HUD (top-right corner) ─────────────────
        const ts = aiTelemetry.threatScore || 0;
        if (ts > 0) {
          const tsColor = ts >= 75 ? '#ef4444' : ts >= 55 ? '#fbbf24' : ts >= 30 ? '#38bdf8' : '#10b981';
          const tsLabel = ts >= 75 ? 'CRITICAL' : ts >= 55 ? 'HIGH' : ts >= 30 ? 'MEDIUM' : 'LOW';
          ctx.fillStyle = 'rgba(4, 7, 18, 0.90)';
          ctx.fillRect(cw - 148, 6, 140, 34);
          ctx.strokeStyle = tsColor;
          ctx.lineWidth = 1.5;
          ctx.strokeRect(cw - 148, 6, 140, 34);
          ctx.fillStyle = tsColor;
          ctx.font = "bold 10px 'JetBrains Mono', monospace";
          ctx.fillText(`THREAT: ${ts}/100`, cw - 143, 21);
          ctx.font = "9px 'JetBrains Mono', monospace";
          ctx.fillText(`[${tsLabel}]  ZONE:${aiTelemetry.zoneIntrusions || 0}`, cw - 143, 34);
        }

        // ── CAMERA STATUS STRIP (bottom-left) ─────────────────────────────
        const stats = aiTelemetry.aiStats || {};
        const personsN = aiTelemetry.targets?.length || 0;
        const vehN = (aiTelemetry.vehicles?.length || 0);
        ctx.fillStyle = 'rgba(4, 7, 18, 0.85)';
        ctx.fillRect(4, ch - 28, 300, 24);
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
        ctx.lineWidth = 1;
        ctx.strokeRect(4, ch - 28, 300, 24);
        ctx.fillStyle = '#00f0ff';
        ctx.font = "8px 'JetBrains Mono', monospace";
        ctx.fillText(
          `PERSONS:${personsN} VEH:${vehN} OBJ:${(aiTelemetry.otherObjects || aiTelemetry.other_objects || []).length} ALERTS:${(aiTelemetry.aiAlerts || []).filter(a => a.status === 'ACTIVE').length} | YOLO | LAT:${aiTelemetry.latencyMs?.toFixed(0)||'?'}ms`,
          10, ch - 12
        );

        // ── TACTICAL BORDER ZERO-LINE BP-44 ───────────────────────────────
        ctx.save();
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.35)';
        ctx.lineWidth = 1;
        ctx.setLineDash([8, 6]);
        ctx.beginPath();
        ctx.moveTo(10, ch * 0.82);
        ctx.lineTo(cw - 10, ch * 0.82);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(0, 240, 255, 0.55)';
        ctx.font = "8px 'JetBrains Mono', monospace";
        ctx.fillText("BORDER ZERO-LINE BP-44 // PATROL CORRIDOR ALPHA", 14, ch * 0.82 - 4);

        // ── VIRTUAL RESTRICTED ZONE BOUNDARY (SECTOR ALPHA) ──────────────
        const zx = 0.30 * cw, zy = 0.20 * ch, zw = 0.50 * cw, zh = 0.65 * ch;
        ctx.strokeStyle = aiTelemetry.zoneIntrusions > 0 ? 'rgba(239, 68, 68, 0.6)' : 'rgba(251, 191, 36, 0.25)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(zx, zy, zw, zh);
        ctx.setLineDash([]);
        ctx.fillStyle = aiTelemetry.zoneIntrusions > 0 ? 'rgba(239, 68, 68, 0.8)' : 'rgba(251, 191, 36, 0.6)';
        ctx.font = "8px 'JetBrains Mono', monospace";
        ctx.fillText("⚑ RESTRICTED ZONE [SECTOR ALPHA]", zx + 6, zy + 12);

        // ── OPTICAL MODE BADGE FOR DAY MODE ──────────────────────────────
        const cam1Mode = visionModesRef.current['CAM-01'] || 'DAY';
        if (cam1Mode === 'DAY') {
          ctx.fillStyle = 'rgba(4, 7, 18, 0.82)';
          ctx.fillRect(4, 4, 180, 18);
          ctx.strokeStyle = '#00f0ff';
          ctx.lineWidth = 1;
          ctx.strokeRect(4, 4, 180, 18);
          ctx.fillStyle = '#00f0ff';
          ctx.font = "bold 9px 'JetBrains Mono', monospace";
          ctx.fillText("◈ OPTICAL MODE: DAY", 10, 16);
        }

        // ── ENVIRONMENT & VISIBILITY STATUS (top-center) ──────────────────
        const env1 = getEnvStatus('CAM-01', cam1Mode);
        ctx.fillStyle = 'rgba(4, 7, 18, 0.80)';
        ctx.fillRect(cw / 2 - 80, 4, 160, 18);
        ctx.strokeStyle = 'rgba(255,255,255,0.18)';
        ctx.lineWidth = 1;
        ctx.strokeRect(cw / 2 - 80, 4, 160, 18);
        ctx.fillStyle = '#94a3b8';
        ctx.font = "8px 'JetBrains Mono', monospace";
        ctx.fillText(`ENV: ${env1.env} | VIS: ${env1.vis}`, cw / 2 - 74, 16);
        ctx.restore();
      }

      animId = requestAnimationFrame(renderOverlay);
    };

    animId = requestAnimationFrame(renderOverlay);

    return () => cancelAnimationFrame(animId);
  }, [isCameraActive, aiTelemetry]);

  // -----------------------------------------------------------------
  // 6. Canvas Simulation Loops for CAM-01 (fallback), CAM-02, CAM-03, CAM-04
  // -----------------------------------------------------------------
  useEffect(() => {
    let animationFrameId;
    let frameCount = 0;

    const drawBorderOverlays = (ctx, w, h, camId, mode) => {
      // 1. Virtual Border Line (dashed at lower third)
      ctx.save();
      ctx.strokeStyle = 'rgba(0, 240, 255, 0.35)';
      ctx.lineWidth = 1;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(10, h * 0.82);
      ctx.lineTo(w - 10, h * 0.82);
      ctx.stroke();
      ctx.setLineDash([]);
      
      ctx.fillStyle = 'rgba(0, 240, 255, 0.55)';
      ctx.font = "8px 'JetBrains Mono', monospace";
      ctx.fillText(`BORDER LINE BP-44 // ${camId} COVERAGE`, 14, h * 0.82 - 4);

      // 2. Mode HUD Badge (top-left)
      const badge = modeHudLabel(mode);
      const isNight = mode === 'NIGHT';
      const isTherm = mode === 'THERMAL';
      const isFog = mode === 'FOG';
      const badgeColor = isNight ? '#10b981' : isTherm ? '#ef4444' : isFog ? '#38bdf8' : '#00f0ff';

      ctx.fillStyle = 'rgba(4, 7, 18, 0.85)';
      ctx.fillRect(6, 6, 215, 18);
      ctx.strokeStyle = badgeColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(6, 6, 215, 18);
      ctx.fillStyle = badgeColor;
      ctx.font = "bold 9px 'JetBrains Mono', monospace";
      ctx.fillText(`◈ ${badge}`, 10, 18);

      // 3. Environment & Visibility Status (top-right)
      const env = getEnvStatus(camId, mode);
      ctx.fillStyle = 'rgba(4, 7, 18, 0.80)';
      ctx.fillRect(w - 150, 6, 144, 18);
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 1;
      ctx.strokeRect(w - 150, 6, 144, 18);
      ctx.fillStyle = '#94a3b8';
      ctx.font = "8px 'JetBrains Mono', monospace";
      ctx.fillText(`ENV: ${env.env} | ${env.vis}`, w - 145, 18);
      ctx.restore();
    };

    const renderSimFeeds = () => {
      frameCount++;
      const time = performance.now() * 0.001;

      // CAM-01 Fallback Simulation (only active if camera is offline)
      const c1 = canvasRefs['CAM-01'].current;
      if (c1 && !isCameraActive) {
        const ctx = c1.getContext('2d', { willReadFrequently: true });
        const w = (c1.width = 480);
        const h = (c1.height = 270);

        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, '#0a172c');
        grad.addColorStop(0.5, '#132845');
        grad.addColorStop(1, '#08111e');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        ctx.strokeStyle = 'rgba(0, 240, 255, 0.1)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let x = 40; x < w; x += 60) {
          ctx.moveTo(x, 0); ctx.lineTo(x, h);
        }
        for (let y = 30; y < h; y += 40) {
          ctx.moveTo(0, y); ctx.lineTo(w, y);
        }
        ctx.stroke();

        const targetX = 220 + Math.sin(time * 0.8) * 80;
        const targetY = 130 + Math.cos(time * 0.5) * 15;
        const boxW = 55;
        const boxH = 95;

        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.strokeRect(targetX - boxW / 2, targetY - boxH / 2, boxW, boxH);

        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.fillRect(targetX - boxW / 2, targetY - boxH / 2 - 20, 130, 18);
        ctx.fillStyle = '#ef4444';
        ctx.font = 'bold 9px "JetBrains Mono", monospace';
        ctx.fillText(`SIM_LOC_#01: PERSON 94%`, targetX - boxW / 2 + 4, targetY - boxH / 2 - 8);

        const m1 = visionModesRef.current['CAM-01'] || 'DAY';
        if (m1 !== 'DAY') {
          try {
            const imgData = ctx.getImageData(0, 0, w, h);
            applyVisionFilter(imgData, m1);
            ctx.putImageData(imgData, 0, 0);
          } catch (_) {}
        }
        drawBorderOverlays(ctx, w, h, 'CAM-01', m1);
      }

      // CAM-03: FLIR THERMAL IR SENSOR (Sector Charlie)
      const c3 = canvasRefs['CAM-03'].current;
      if (c3) {
        const ctx = c3.getContext('2d', { willReadFrequently: true });
        const w = (c3.width = 480);
        const h = (c3.height = 270);

        const tGrad = ctx.createLinearGradient(0, 0, w, h);
        tGrad.addColorStop(0, '#0a0624');
        tGrad.addColorStop(0.6, '#180e3b');
        tGrad.addColorStop(1, '#050212');
        ctx.fillStyle = tGrad;
        ctx.fillRect(0, 0, w, h);

        ctx.strokeStyle = 'rgba(76, 29, 149, 0.4)';
        ctx.lineWidth = 3;
        for (let y = 140; y < h; y += 25) {
          ctx.beginPath();
          ctx.moveTo(0, y);
          for (let x = 0; x < w; x += 40) {
            ctx.quadraticCurveTo(x + 20, y + Math.sin(time * 2 + x * 0.05) * 8, x + 40, y);
          }
          ctx.stroke();
        }

        const heatX = 220 + Math.sin(time * 0.4) * 45;
        const heatY = 165 + Math.cos(time * 0.3) * 10;

        const radial = ctx.createRadialGradient(heatX, heatY, 2, heatX, heatY, 35);
        radial.addColorStop(0, '#ffffff');
        radial.addColorStop(0.2, '#fef08a');
        radial.addColorStop(0.5, '#f97316');
        radial.addColorStop(0.8, '#dc2626');
        radial.addColorStop(1, 'transparent');
        ctx.fillStyle = radial;
        ctx.beginPath();
        ctx.arc(heatX, heatY, 35, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(heatX - 25, heatY - 25, 50, 50);
        ctx.setLineDash([]);

        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.fillRect(heatX - 25, heatY - 42, 140, 16);
        ctx.fillStyle = '#ff6b6b';
        ctx.font = 'bold 9px "JetBrains Mono", monospace';
        ctx.fillText('INTRUSION ALERT: 38.6°C', heatX - 22, heatY - 30);

        const m3 = visionModesRef.current['CAM-03'] || 'THERMAL';
        if (m3 !== 'THERMAL') {
          try {
            const imgData = ctx.getImageData(0, 0, w, h);
            applyVisionFilter(imgData, m3);
            ctx.putImageData(imgData, 0, 0);
          } catch (_) {}
        }
        drawBorderOverlays(ctx, w, h, 'CAM-03', m3);
      }

      // CAM-04: ANPR CHECKPOST ALPHA (Sector Delta)
      const c4 = canvasRefs['CAM-04'].current;
      if (c4) {
        const ctx = c4.getContext('2d', { willReadFrequently: true });
        const w = (c4.width = 480);
        const h = (c4.height = 270);

        ctx.fillStyle = '#0e1726';
        ctx.fillRect(0, 0, w, h);

        ctx.fillStyle = '#090f19';
        ctx.beginPath();
        ctx.moveTo(w * 0.3, h);
        ctx.lineTo(w * 0.45, 80);
        ctx.lineTo(w * 0.55, 80);
        ctx.lineTo(w * 0.7, h);
        ctx.fill();

        ctx.strokeStyle = 'rgba(0, 240, 255, 0.25)';
        ctx.lineWidth = 1;
        const laserY = 120 + ((frameCount * 3) % 110);
        ctx.beginPath();
        ctx.moveTo(w * 0.25, laserY);
        ctx.lineTo(w * 0.75, laserY);
        ctx.stroke();

        const vW = 100;
        const vH = 65;
        const vX = w * 0.5 - vW / 2;
        const vY = 135;

        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = 2;
        ctx.strokeRect(vX, vY, vW, vH);

        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(vX + 25, vY + vH - 16, 50, 12);
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 8px "JetBrains Mono", monospace';
        ctx.fillText('DL-01-AX-9921', vX + 27, vY + vH - 7);

        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.fillRect(vX, vY - 20, 120, 16);
        ctx.fillStyle = '#00f0ff';
        ctx.font = 'bold 9px "JetBrains Mono", monospace';
        ctx.fillText('ANPR: MATCH [VEHICLE]', vX + 4, vY - 8);

        const m4 = visionModesRef.current['CAM-04'] || 'DAY';
        if (m4 !== 'DAY') {
          try {
            const imgData = ctx.getImageData(0, 0, w, h);
            applyVisionFilter(imgData, m4);
            ctx.putImageData(imgData, 0, 0);
          } catch (_) {}
        }
        drawBorderOverlays(ctx, w, h, 'CAM-04', m4);
      }

      animationFrameId = requestAnimationFrame(renderSimFeeds);
    };

    animationFrameId = requestAnimationFrame(renderSimFeeds);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isCameraActive]);

  const activeFusion = fusionState || aiTelemetry.fusion || null;
  const priorityCam = activeFusion?.priority_camera || null;
  const priorityReason = activeFusion?.priority_reason || null;
  const affectedCams = activeFusion?.affected_cameras || [];
  const normalCams = activeFusion?.normal_cameras || ['CAM-01', 'CAM-02', 'CAM-03', 'CAM-04'];
  const fusedIncidents = activeFusion?.fused_incidents || [];
  const crossTimeline = activeFusion?.cross_camera_timeline || [];
  const whatIsHappening = activeFusion?.what_is_happening_now || [];
  const snapshotsList = activeFusion?.snapshots || [];
  const activityCards = (aiTelemetry.personActivityCards && aiTelemetry.personActivityCards.length > 0)
    ? aiTelemetry.personActivityCards
    : (aiTelemetry.targets || []).map((t) => t.activity_card).filter(Boolean);

  return (
    <div className="cctv-grid-container">
      {cameraError && (
        <div className="login-error-banner" style={{ marginBottom: 10 }}>
          ⚠️ {cameraError}
        </div>
      )}

      {/* Tactical Quick Demo Scenarios & SIH Multi-Camera Correlation Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 6,
          marginBottom: 10,
          padding: '6px 12px',
          background: 'rgba(6, 12, 24, 0.92)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 4,
        }}
      >
        <span style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-ui)', letterSpacing: 1, fontWeight: 700 }}>
          OPTICAL OPERATIONS:
        </span>
        {[
          { id: 'NORMAL_DAY', label: 'NORMAL DAY', desc: 'All cameras standard optical' },
          { id: 'NIGHT_PATROL', label: 'NIGHT PATROL', desc: 'Phosphor NVD + Thermal' },
          { id: 'FOG_OPERATION', label: 'FOG DEHAZE', desc: 'Atmospheric contrast penetration' },
          { id: 'THERMAL_SEARCH', label: 'THERMAL SCAN', desc: 'MWIR heatmap search' },
          { id: 'LOW_VISIBILITY', label: 'LOW-LIGHT MODE', desc: 'Low-Light Visual Mode + Rain enhancement' },
          { id: 'AI_OVERWATCH', label: 'AI VISION', desc: 'AI contrast telemetry mode' },
        ].map((sc) => (
          <button
            key={sc.id}
            className="btn-cam-action"
            style={{ fontSize: 9, padding: '3px 8px', letterSpacing: 0.5 }}
            onClick={() => applyScenario(sc.id)}
            title={sc.desc}
          >
            {sc.label}
          </button>
        ))}

        {/* SIH Multi-Camera Correlation Demonstration Trigger */}
        <button
          className="btn-cam-action"
          style={{
            fontSize: 9.5,
            padding: '3px 10px',
            letterSpacing: 0.6,
            fontWeight: 700,
            background: 'rgba(249, 115, 22, 0.16)',
            borderColor: '#f97316',
            color: '#fbbf24',
            marginLeft: 6,
          }}
          onClick={handleTriggerSihDemoFusion}
          disabled={isTriggeringDemo}
          title="SIH Judge Demonstration Mode: Correlate CAM-02, CAM-03, CAM-04 events while keeping CAM-01 live normal"
        >
          {isTriggeringDemo ? '⏳ CORRELATING...' : '🎯 SIH MULTI-CAMERA FUSION DEMO (CAM-01..04)'}
        </button>

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'var(--font-ui)' }}>
            IBVAP FUSION:
          </span>
          <span
            style={{
              fontSize: 10,
              color: affectedCams.length >= 2 ? '#f97316' : '#10b981',
              fontFamily: 'var(--font-ui)',
              fontWeight: 700,
            }}
          >
            {affectedCams.length >= 2
              ? `⚠ ${affectedCams.length} AFFECTED / ${normalCams.length} NORMAL`
              : '● ALL SECTORS NOMINAL'}
          </span>
        </div>
      </div>

      {/* Smart Camera Prioritization Banner (when HIGH / CRITICAL or Multi-Camera Incident occurs) */}
      {priorityCam && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 8,
            marginBottom: 10,
            padding: '8px 14px',
            background: 'linear-gradient(90deg, rgba(239, 68, 68, 0.18), rgba(249, 115, 22, 0.10))',
            border: '1px solid #ef4444',
            borderRadius: 4,
            fontFamily: 'var(--font-ui)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              style={{
                background: '#ef4444',
                color: '#fff',
                fontSize: 9,
                fontWeight: 800,
                padding: '2px 7px',
                borderRadius: 3,
                letterSpacing: 0.8,
              }}
            >
              PRIMARY INCIDENT VIEW: {priorityCam}
            </span>
            <span style={{ fontSize: 10.5, color: '#f8fafc', fontWeight: 700 }}>
              {priorityReason || `High-priority security event active on ${priorityCam}`}
            </span>
            {affectedCams.length > 0 && (
              <span style={{ fontSize: 9.5, color: '#fbbf24' }}>
                | Affected: {affectedCams.join(', ')} | Normal: {normalCams.join(', ') || 'None'}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button
              className="btn-cam-action"
              style={{
                fontSize: 9,
                padding: '2px 8px',
                borderColor: '#00f0ff',
                color: '#00f0ff',
                fontWeight: 700,
              }}
              onClick={() => setMaximizedCam(maximizedCam === priorityCam ? null : priorityCam)}
            >
              {maximizedCam === priorityCam ? '⊠ SHOW 2x2 GRID + SECONDARY VIEWS' : `⛶ FOCUS ${priorityCam} PRIMARY VIEW`}
            </button>
            <button
              className="btn-cam-action"
              style={{ fontSize: 9, padding: '2px 8px', color: '#94a3b8' }}
              onClick={() => {
                setMaximizedCam(null);
                handleClearPriorityCamera();
              }}
            >
              ✕ CLEAR PRIORITY
            </button>
          </div>
        </div>
      )}

      <div className={`cctv-grid-2x2 ${maximizedCam ? 'single-maximized' : ''}`}>
        {cameras.map((cam) => {
          if (maximizedCam && maximizedCam !== cam.id) return null;

          const isCam1 = cam.id === 'CAM-01';
          const isPriority = priorityCam === cam.id;
          const isAffected = affectedCams.includes(cam.id);
          const isAlerting = isPriority || alerts.some((a) => a.camera && a.camera.includes(cam.id) && (a.severity === 'CRITICAL' || a.severity === 'HIGH'));
          const camMode = visionModes[cam.id] || 'DAY';
          const envStatus = getEnvStatus(cam.id, camMode);
          const displayedResolution = cam.id === 'CAM-02'
            ? (cam2Status.resolution || '--')
            : cam.resolution;

          return (
            <div
              key={cam.id}
              className={`cctv-panel ${isAlerting ? 'panel-alert' : ''}`}
              style={
                isPriority
                  ? {
                      border: '2px solid #ef4444',
                      boxShadow: '0 0 22px rgba(239, 68, 68, 0.35)',
                    }
                  : undefined
              }
            >
              <div className="panel-hud-header">
                <div className="panel-header-left" style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span className="cam-badge">{cam.id}</span>
                  <span className="cam-name">{cam.name}</span>
                  {isPriority && (
                    <span
                      style={{
                        background: '#ef4444',
                        color: '#fff',
                        fontSize: 8.5,
                        fontWeight: 800,
                        padding: '1px 6px',
                        borderRadius: 3,
                        letterSpacing: 0.6,
                      }}
                    >
                      ★ PRIMARY INCIDENT VIEW
                    </span>
                  )}
                  {!isPriority && isAffected && (
                    <span
                      style={{
                        background: 'rgba(249, 115, 22, 0.2)',
                        border: '1px solid #f97316',
                        color: '#fbbf24',
                        fontSize: 8.5,
                        fontWeight: 700,
                        padding: '1px 5px',
                        borderRadius: 3,
                      }}
                    >
                      AFFECTED CAMERA
                    </span>
                  )}
                  {!isPriority && !isAffected && affectedCams.length >= 2 && (
                    <span
                      style={{
                        background: 'rgba(16, 185, 129, 0.15)',
                        border: '1px solid #10b981',
                        color: '#10b981',
                        fontSize: 8.5,
                        fontWeight: 700,
                        padding: '1px 5px',
                        borderRadius: 3,
                      }}
                    >
                      NORMAL CAMERA
                    </span>
                  )}
                </div>

                <div className="panel-header-right">
                  {/* Vision Mode Selector Dropdown for EVERY Camera */}
                  <select
                    className="tactical-input"
                    style={{
                      fontSize: 10,
                      padding: '1px 5px',
                      height: 22,
                      maxWidth: 125,
                      background: '#070f1e',
                      borderColor: camMode !== 'DAY' ? '#00f0ff' : 'var(--border-subtle)',
                      color: camMode === 'NIGHT' ? '#10b981' : camMode === 'THERMAL' ? '#ef4444' : camMode === 'FOG' ? '#38bdf8' : '#00f0ff',
                      fontFamily: 'var(--font-ui)',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                    value={camMode}
                    onChange={(e) => setMode(cam.id, e.target.value)}
                    title={`Change optical/environmental vision mode for ${cam.id}`}
                  >
                    {VISION_MODES.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.icon} {m.label}
                      </option>
                    ))}
                  </select>

                  {/* Automatic Mode Recommendation (CAM-01 heuristic) */}
                  {isCam1 && autoSuggestedMode && autoSuggestedMode !== camMode && (
                    <button
                      className="btn-cam-action"
                      style={{
                        fontSize: 9,
                        padding: '1px 6px',
                        height: 22,
                        background: 'rgba(251, 191, 36, 0.15)',
                        borderColor: '#fbbf24',
                        color: '#fbbf24',
                        cursor: 'pointer',
                      }}
                      onClick={() => setMode('CAM-01', autoSuggestedMode)}
                      title={`Environmental sensor suggests ${autoSuggestedMode} mode`}
                    >
                      💡 {autoSuggestedMode} [APPLY]
                    </button>
                  )}

                  {/* Camera Device Switcher Dropdown for CAM-01 */}
                  {isCam1 && videoDevices.length > 0 && (
                    <select
                      className="tactical-input"
                      style={{
                        fontSize: 10,
                        padding: '2px 6px',
                        height: 22,
                        maxWidth: 140,
                        background: '#090d17',
                        borderColor: 'var(--border-subtle)',
                        color: 'var(--cyan-glow)',
                        fontFamily: 'var(--font-ui)',
                        cursor: 'pointer',
                      }}
                      value={selectedDeviceId}
                      onChange={(e) => setSelectedDeviceId(e.target.value)}
                      title="Switch optical ingestion hardware device"
                    >
                      {videoDevices.map((dev, idx) => (
                        <option key={dev.deviceId || idx} value={dev.deviceId}>
                          {dev.label || `Camera #${idx + 1}`}
                        </option>
                      ))}
                    </select>
                  )}

                  <div className="rec-indicator">
                    <span className="rec-dot"></span>
                    <span>REC</span>
                  </div>

                  {onOpenPTZ && (
                    <button
                      className="btn-cam-action"
                      onClick={() => onOpenPTZ(`${cam.id} (${cam.sector || 'Sector'})`)}
                      title="Launch PTZ Tactical Slew Pad"
                    >
                      ✢ PTZ
                    </button>
                  )}

                  {onTakeSnapshot && (
                    <button
                      className="btn-cam-action"
                      onClick={onTakeSnapshot}
                      title="Capture Quad Snapshot Archive"
                    >
                      📷 SNAP
                    </button>
                  )}

                  <button
                    className="btn-cam-action"
                    onClick={() => setMaximizedCam(maximizedCam === cam.id ? null : cam.id)}
                    title="Toggle maximize view"
                  >
                    {maximizedCam === cam.id ? '⊠ RESTORE' : '⛶ MAX'}
                  </button>

                  {/* Expanded AI Intelligence View */}
                  <button
                    className="btn-cam-action"
                    onClick={() => setExpandedCam({ id: cam.id, url: cam.url })}
                    title="Open expanded AI surveillance view with inspection panel"
                    style={{
                      background: 'rgba(0, 240, 255, 0.08)',
                      borderColor: '#00f0ff',
                      color: '#00f0ff',
                      fontWeight: 700,
                    }}
                  >
                    ⊹ AI VIEW
                  </button>
                </div>
              </div>

              <div className="panel-viewport">
                {isCam1 ? (
                  <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
                    {/* Real Laptop/USB Webcam Video Feed (mirrored) - Always in DOM */}
                    <video
                      ref={(el) => {
                        videoRef.current = el;
                        if (el && streamRef.current && el.srcObject !== streamRef.current) {
                          el.srcObject = streamRef.current;
                          el.play().catch(() => {});
                        }
                      }}
                      onLoadedMetadata={() => {
                        if (videoRef.current) {
                          videoRef.current.play().catch(() => {});
                        }
                      }}
                      autoPlay
                      playsInline
                      muted
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        transform: 'scaleX(-1)',
                        display: isCameraActive ? 'block' : 'none',
                      }}
                    />

                    {/* Filter Display Canvas (renders when vision mode != 'DAY') */}
                    <canvas
                      ref={filterCanvasRef}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        display: isCameraActive && camMode !== 'DAY' ? 'block' : 'none',
                      }}
                    />

                    {/* Real-time AI HUD Overlay Canvas */}
                    <canvas
                      ref={overlayCanvasRef}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        pointerEvents: isCameraActive ? 'auto' : 'none',
                        display: isCameraActive ? 'block' : 'none',
                        cursor: 'crosshair',
                      }}
                      onClick={(e) => {
                        const canvas = overlayCanvasRef.current;
                        if (!canvas) return;
                        const rect = canvas.getBoundingClientRect();
                        const clickX = e.clientX - rect.left;
                        const clickY = e.clientY - rect.top;
                        const cw = canvas.width;
                        const ch = canvas.height;
                        // Check person targets, vehicles, and all other detected COCO objects
                        const allObjects = [
                          ...(aiTelemetry.targets || []).map(t => ({ ...t, _type: 'person' })),
                          ...(aiTelemetry.vehicles || []).map(v => ({ ...v, _type: 'vehicle' })),
                          ...(aiTelemetry.otherObjects || aiTelemetry.other_objects || []).map(o => ({ ...o, _type: 'object' })),
                        ];
                        for (const obj of allObjects) {
                          const [nx, ny, nw, nh] = obj.normalized_box || [0, 0, 0, 0];
                          const bx = nx * cw, by = ny * ch, bw = nw * cw, bh = nh * ch;
                          if (clickX >= bx && clickX <= bx + bw && clickY >= by && clickY <= by + bh) {
                            setInspectedObject(obj);
                            return;
                          }
                        }
                        setInspectedObject(null);
                      }}
                    />

                    {/* Fallback Simulation Canvas if camera is offline/denied */}
                    <canvas
                      ref={canvasRefs['CAM-01']}
                      className="feed-canvas"
                      style={{
                        display: isCameraActive ? 'none' : 'block',
                      }}
                    />
                    {/* On-screen AI Issue Alert */}
                    <AiIssuePanel alert={activeIssueAlert} onDismiss={() => setActiveIssueAlert(null)} />
                  </div>
                ) : cam.id === 'CAM-02' ? (
                  <div style={{ position: 'relative', width: '100%', height: '100%', background: '#050b12' }}>
                    {cam2Status.connected ? (
                      <img
                        src="/video_feed/cam2"
                        alt="CAM-02 remote edge camera live stream"
                        className="feed-canvas"
                        style={{ objectFit: 'cover' }}
                        onError={() => setCam2Status((previous) => ({ ...previous, connected: false, stream_status: 'OFFLINE' }))}
                      />
                    ) : (
                      <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: isAffected ? '#fbbf24' : '#ef4444', fontFamily: 'var(--font-ui)', letterSpacing: 1, padding: 12 }}>
                        <div style={{ textAlign: 'center' }}>
                          <strong style={{ display: 'block', fontSize: 16 }}>CAM-02 ({cam.sector || 'Sector Bravo'})</strong>
                          {isAffected ? (
                            <>
                              <span style={{ display: 'inline-block', marginTop: 6, padding: '2px 8px', background: 'rgba(249, 115, 22, 0.2)', border: '1px solid #f97316', borderRadius: 3, fontSize: 10, color: '#fbbf24', fontWeight: 700 }}>
                                ◈ DEMO / SIMULATION TELEMETRY ACTIVE
                              </span>
                              <span style={{ display: 'block', marginTop: 8, fontSize: 11, color: '#e2e8f0' }}>
                                {activeFusion?.camera_states?.['CAM-02']?.last_event || 'Unusual perimeter activity detected'}
                              </span>
                            </>
                          ) : (
                            <span style={{ display: 'block', marginTop: 8, fontSize: 12 }}>REMOTE CAMERA OFFLINE</span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <canvas ref={canvasRefs[cam.id]} className="feed-canvas" />
                )}

                {/* Tactical HUD Reticles */}
                <div className="tactical-crosshair"></div>
                <div className="corner-bracket corner-top-left"></div>
                <div className="corner-bracket corner-top-right"></div>
                <div className="corner-bracket corner-bottom-left"></div>
                <div className="corner-bracket corner-bottom-right"></div>
              </div>

              <div className="panel-hud-footer">
                <div className="footer-meta-left">
                  <span>RES: <strong>{isCam1 && isCameraActive ? '1280x720 (RAW)' : displayedResolution}</strong></span>
                  <span style={{ marginLeft: 8 }}>
                    MODE: <strong style={{ color: 'var(--cyan-glow)' }}>{modeHudLabel(camMode)}</strong>
                  </span>
                  <span style={{ marginLeft: 8 }}>
                    ENV: <strong>{envStatus.env}</strong>
                  </span>
                </div>

                <div className="footer-meta-right">
                  {isCam1 ? (
                    <>
                      <span className="fps-tag">
                        {aiTelemetry.latencyMs > 0 ? `${Math.round(1000 / Math.max(25, aiTelemetry.latencyMs))} FPS (${aiTelemetry.latencyMs.toFixed(0)}ms)` : 'LIVE'}
                      </span>
                      <span
                        className="status-tag"
                        style={{
                          marginLeft: 8,
                          color: isWsConnected ? 'var(--status-green)' : 'var(--warning-amber)',
                        }}
                      >
                        {isWsConnected ? '● AI STREAM' : '○ AI STANDBY'}
                      </span>
                      <span style={{ marginLeft: 8, fontSize: 9, color: 'var(--text-dim)' }}>
                        AI: <strong style={{ color: isWsConnected ? 'var(--status-green)' : 'var(--warning-amber)' }}>
                          {isWsConnected ? (aiTelemetry.aiStats?.yolo_status || 'ACTIVE') : 'STANDBY'}
                        </strong>
                      </span>
                    </>
                  ) : cam.id === 'CAM-02' ? (
                    <>
                      <span className="fps-tag">{cam2Status.connected ? `${cam2Status.fps || 0} FPS` : (isAffected ? '25 FPS [SIM]' : '0 FPS')}</span>
                      <span className="status-tag" style={{ marginLeft: 8, color: cam2Status.connected ? 'var(--status-green)' : isAffected ? '#fbbf24' : '#ef4444' }}>
                        {cam2Status.connected ? '● LIVE' : isAffected ? '◈ DEMO / SIMULATION' : '○ OFFLINE'}
                      </span>
                      <span style={{ marginLeft: 8, fontSize: 9, color: 'var(--text-dim)' }}>
                        LAT: <strong>{cam2Status.latency_ms != null ? `${Math.round(cam2Status.latency_ms)}ms` : '--'}</strong>
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="fps-tag">{cam.fps} FPS</span>
                      <span className="status-tag" style={{ marginLeft: 8, color: '#fbbf24' }}>
                        ◈ DEMO / SIMULATION
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ─── CAMERA HEALTH + AI HEALTH TELEMETRY STRIP (Section 22) ─────────── */}
      <div
        style={{
          marginTop: 10,
          padding: '8px 12px',
          background: 'rgba(6, 12, 24, 0.94)',
          border: '1px solid var(--border-subtle)',
          borderRadius: 4,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          fontFamily: 'var(--font-ui)',
          fontSize: 9.5,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ color: '#00f0ff', fontWeight: 800, letterSpacing: 0.8 }}>
            ⬡ CAMERA + AI HEALTH:
          </span>
          <span>
            CAMERA STATUS: <strong style={{ color: isCameraActive ? '#10b981' : '#fbbf24' }}>{isCameraActive ? 'ONLINE (CAM-01 LIVE)' : 'SIMULATED FALLBACK'}</strong>
          </span>
          <span>
            FPS: <strong style={{ color: '#e2e8f0' }}>{aiTelemetry.latencyMs > 0 ? Math.min(30, Math.round(1000 / Math.max(25, aiTelemetry.latencyMs))) : 28}</strong>
          </span>
          <span>
            AI ENGINE: <strong style={{ color: isWsConnected ? '#10b981' : '#fbbf24' }}>{isWsConnected ? 'ACTIVE' : 'STANDBY'}</strong>
          </span>
          <span>
            MODEL: <strong style={{ color: '#38bdf8' }}>YOLOv8 (80 COCO) + YuNet/SFace</strong>
          </span>
          <span>
            TRACKING: <strong style={{ color: '#10b981' }}>ACTIVE</strong>
          </span>
          <span>
            NETWORK: <strong style={{ color: isWsConnected ? '#10b981' : '#fbbf24' }}>{isWsConnected ? 'ONLINE' : 'LOCAL'}</strong>
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ color: '#94a3b8' }}>
            CUSTOM OBJECT MODEL: <strong style={{ color: '#fbbf24' }}>{aiTelemetry.aiStats?.custom_object_detection || 'NOT CONFIGURED'}</strong>
          </span>
          <span style={{ color: '#94a3b8' }}>
            WEAPON MODEL: <strong style={{ color: '#fbbf24' }}>{aiTelemetry.aiStats?.weapon_detection || 'NOT CONFIGURED'}</strong>
          </span>
        </div>
      </div>

      {/* ─── IBVAP 3-COLUMN INTELLIGENCE & INCIDENT FUSION CONSOLE ──────────── */}
      <div
        style={{
          marginTop: 10,
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
          gap: 10,
          fontFamily: 'var(--font-ui)',
        }}
      >
        {/* COLUMN 1: "WHAT IS HAPPENING NOW" & PERSON ACTIVITY CARDS */}
        <div
          style={{
            background: 'rgba(6, 12, 24, 0.94)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 4,
            padding: '10px 12px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 6 }}>
            <span style={{ color: '#00f0ff', fontWeight: 800, fontSize: 10.5, letterSpacing: 0.8 }}>
              ◈ WHAT IS HAPPENING NOW & PERSON ACTIVITY
            </span>
            <span style={{ fontSize: 9, color: '#10b981', fontWeight: 700 }}>
              LIVE INTELLIGENCE
            </span>
          </div>

          {/* Structured Person Activity Cards (Section 6) */}
          {activityCards.length > 0 && (
            <div style={{ marginBottom: 8 }}>
              {activityCards.slice(0, 2).map((card, idx) => {
                const cRiskColor = getRiskColor(card.risk);
                return (
                  <div
                    key={card.id || idx}
                    style={{
                      padding: '8px 10px',
                      marginBottom: 6,
                      background: 'rgba(15, 23, 42, 0.75)',
                      border: `1px solid ${cRiskColor}66`,
                      borderLeft: `3px solid ${cRiskColor}`,
                      borderRadius: 4,
                      fontSize: 9.5,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <strong style={{ color: '#f8fafc', fontSize: 10 }}>
                        PERSON ACTIVITY CARD — #{card.id} ({card.confidence}%)
                      </strong>
                      <span style={{ color: cRiskColor, fontWeight: 800 }}>
                        {card.risk} ({card.risk_score ?? 10}/100)
                      </span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 8px', color: '#cbd5e1', fontSize: 9 }}>
                      <div><span style={{ color: '#64748b' }}>Zone:</span> {card.location}</div>
                      <div><span style={{ color: '#64748b' }}>Activity:</span> <strong style={{ color: '#00f0ff' }}>{card.activity}</strong></div>
                      <div><span style={{ color: '#64748b' }}>Movement:</span> {card.movement} ({card.speed})</div>
                      <div><span style={{ color: '#64748b' }}>Object:</span> <strong style={{ color: card.object !== 'NONE' ? '#fbbf24' : '#94a3b8' }}>{card.object}</strong></div>
                      <div><span style={{ color: '#64748b' }}>Face Status:</span> {card.face_status}</div>
                      <div><span style={{ color: '#64748b' }}>Time Seen:</span> {card.time_seen}</div>
                    </div>
                    {card.behavioral_signals && card.behavioral_signals.length > 0 && (
                      <div style={{ marginTop: 4, color: '#38bdf8', fontSize: 8.5 }}>
                        <strong>Behavioral Signals:</strong> {card.behavioral_signals.join(' • ')}
                      </div>
                    )}
                    <div style={{ marginTop: 4, color: cRiskColor, fontSize: 8.5 }}>
                      <strong>Reason:</strong> {card.reason}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Operator "WHAT IS HAPPENING NOW" Summary Cards (Section 20) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
            {whatIsHappening.slice(0, 4).map((item, i) => {
              const rColor = getRiskColor(item.risk);
              return (
                <div
                  key={i}
                  style={{
                    padding: '7px 9px',
                    background: 'rgba(9, 15, 28, 0.85)',
                    border: '1px solid rgba(255,255,255,0.08)',
                    borderRadius: 3,
                    fontSize: 9,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ color: '#00f0ff', fontWeight: 700 }}>
                      Camera: {item.camera} {item.is_demo ? '[DEMO / SIMULATION]' : '[LIVE]'}
                    </span>
                    <span style={{ color: rColor, fontWeight: 700 }}>
                      Risk: {item.risk} ({item.risk_score ?? 0}/100)
                    </span>
                  </div>
                  <div style={{ color: '#e2e8f0', fontWeight: 600, marginBottom: 2 }}>{item.subject}</div>
                  <div style={{ color: '#94a3b8', fontSize: 8.5 }}>
                    Movement: <strong style={{ color: '#cbd5e1' }}>{item.movement}</strong> | Object: <strong style={{ color: '#fbbf24' }}>{item.object}</strong> | Zone: <strong style={{ color: '#cbd5e1' }}>{item.zone}</strong> | Face: <strong style={{ color: '#cbd5e1' }}>{item.face}</strong>
                  </div>
                  <div style={{ color: rColor, fontSize: 8.5, marginTop: 2 }}>
                    Reason: {item.reason}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* COLUMN 2: IBVAP INCIDENT FUSION ENGINE & EXPLAINABLE THREAT SCORE */}
        <div
          style={{
            background: 'rgba(6, 12, 24, 0.94)',
            border: affectedCams.length >= 2 ? '1px solid #f97316' : '1px solid var(--border-subtle)',
            borderRadius: 4,
            padding: '10px 12px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 6 }}>
            <span style={{ color: '#fbbf24', fontWeight: 800, fontSize: 10.5, letterSpacing: 0.8 }}>
              ⬡ IBVAP INCIDENT FUSION & EXPLAINABLE AI
            </span>
            <span style={{ fontSize: 9, color: affectedCams.length >= 2 ? '#ef4444' : '#38bdf8', fontWeight: 700 }}>
              {affectedCams.length >= 2 ? 'MULTI-CAMERA SECURITY ALERT' : 'CORRELATION ENGINE ARMED'}
            </span>
          </div>

          {/* Affected vs Normal Cameras summary (Section 11) */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, fontSize: 9 }}>
            <div style={{ flex: 1, padding: '5px 8px', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.35)', borderRadius: 3 }}>
              <div style={{ color: '#ef4444', fontWeight: 700, fontSize: 8.5 }}>AFFECTED CAMERAS</div>
              <div style={{ color: '#f8fafc', fontWeight: 700, marginTop: 2 }}>
                {affectedCams.length > 0 ? affectedCams.join(', ') : 'None (All Nominal)'}
              </div>
            </div>
            <div style={{ flex: 1, padding: '5px 8px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.35)', borderRadius: 3 }}>
              <div style={{ color: '#10b981', fontWeight: 700, fontSize: 8.5 }}>NORMAL CAMERAS</div>
              <div style={{ color: '#f8fafc', fontWeight: 700, marginTop: 2 }}>
                {normalCams.length > 0 ? normalCams.join(', ') : 'None'}
              </div>
            </div>
          </div>

          {/* Fused Incident Card (Section 16) */}
          {fusedIncidents.length > 0 ? (
            fusedIncidents.slice(0, 1).map((inc) => (
              <div
                key={inc.incident_id}
                style={{
                  padding: '8px 10px',
                  background: 'rgba(15, 23, 42, 0.85)',
                  border: '1px solid rgba(249, 115, 22, 0.5)',
                  borderRadius: 4,
                  fontSize: 9,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <strong style={{ color: '#fbbf24', fontSize: 10 }}>{inc.incident_id}</strong>
                  <span style={{ color: '#ef4444', fontWeight: 800 }}>
                    STATUS: {inc.status} | RISK: {inc.risk} ({inc.risk_score}/100)
                  </span>
                </div>
                <div style={{ color: '#cbd5e1', fontSize: 8.5, marginBottom: 4 }}>
                  <div><strong>Cameras Involved:</strong> {(inc.cameras_involved || []).join(', ')} | <strong>Normal:</strong> {(inc.normal_cameras || []).join(', ')}</div>
                  <div><strong>Cross-Camera Track:</strong> <span style={{ color: '#38bdf8' }}>{inc.cross_camera_identity}</span></div>
                </div>

                {/* Explainable Risk Score Breakdown (Section 9) */}
                {inc.contributing_signals && inc.contributing_signals.length > 0 && (
                  <div style={{ marginBottom: 5, padding: '5px 7px', background: 'rgba(4, 8, 20, 0.8)', borderRadius: 3 }}>
                    <div style={{ color: '#00f0ff', fontWeight: 700, fontSize: 8.5, marginBottom: 2 }}>
                      RISK SCORE: {inc.risk_score} / 100 ({inc.risk}) — CONTRIBUTING SIGNALS:
                    </div>
                    {inc.contributing_signals.map((sig, idx) => (
                      <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8.5, color: '#cbd5e1' }}>
                        <span>• {sig.signal}</span>
                        <strong style={{ color: '#fbbf24' }}>+{sig.points}</strong>
                      </div>
                    ))}
                  </div>
                )}

                {/* AI Explainability Panel (Section 17) */}
                {inc.explainability && (
                  <div style={{ padding: '5px 7px', background: 'rgba(249, 115, 22, 0.08)', border: '1px solid rgba(249, 115, 22, 0.3)', borderRadius: 3, fontSize: 8.5 }}>
                    <div style={{ color: '#fbbf24', fontWeight: 700, marginBottom: 2 }}>AI EXPLAINABILITY:</div>
                    <div><strong style={{ color: '#94a3b8' }}>WHAT:</strong> {inc.explainability.what}</div>
                    <div><strong style={{ color: '#94a3b8' }}>WHERE:</strong> {inc.explainability.where}</div>
                    <div><strong style={{ color: '#94a3b8' }}>WHEN:</strong> {inc.explainability.when}</div>
                    <div><strong style={{ color: '#94a3b8' }}>OBJECT:</strong> {inc.explainability.object}</div>
                    <div><strong style={{ color: '#94a3b8' }}>WHY:</strong> {inc.explainability.why}</div>
                    <div><strong style={{ color: '#94a3b8' }}>CONFIDENCE:</strong> {inc.explainability.confidence}%</div>
                  </div>
                )}
              </div>
            ))
          ) : (
            <div style={{ padding: '8px 10px', background: 'rgba(15, 23, 42, 0.65)', borderRadius: 4, fontSize: 9 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <strong style={{ color: '#00f0ff' }}>LIVE EXPLAINABLE RISK SCORE (CAM-01)</strong>
                <strong style={{ color: aiTelemetry.threatScore >= 50 ? '#ef4444' : '#10b981' }}>
                  {aiTelemetry.threatScore || 0} / 100
                </strong>
              </div>
              {(aiTelemetry.contributingSignals && aiTelemetry.contributingSignals.length > 0) ? (
                aiTelemetry.contributingSignals.map((s, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8.5, color: '#cbd5e1' }}>
                    <span>• {s.signal}</span>
                    <strong style={{ color: '#fbbf24' }}>+{s.points}</strong>
                  </div>
                ))
              ) : (
                <div style={{ color: '#94a3b8', fontSize: 8.5 }}>
                  No elevated risk signals active on CAM-01. Click <strong>"🎯 SIH MULTI-CAMERA FUSION DEMO"</strong> above to demonstrate multi-camera event correlation across CAM-01..04.
                </div>
              )}
            </div>
          )}
        </div>

        {/* COLUMN 3: CROSS-CAMERA EVENT TIMELINE & PRESERVED INCIDENT SNAPSHOTS */}
        <div
          style={{
            background: 'rgba(6, 12, 24, 0.94)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 4,
            padding: '10px 12px',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: 6 }}>
            <span style={{ color: '#00f0ff', fontWeight: 800, fontSize: 10.5, letterSpacing: 0.8 }}>
              ⏱ CROSS-CAMERA TIMELINE & SNAPSHOT EVIDENCE
            </span>
            <span style={{ fontSize: 9, color: '#94a3b8' }}>
              {snapshotsList.length} SNAPSHOTS
            </span>
          </div>

          {/* Cross-Camera Event Timeline (Section 12) */}
          <div style={{ maxHeight: 135, overflowY: 'auto', marginBottom: 8, paddingRight: 4 }}>
            {crossTimeline.length > 0 ? (
              crossTimeline.slice(0, 8).map((step, idx) => {
                const sColor = step.severity === 'CRITICAL' || step.severity === 'HIGH'
                  ? '#ef4444'
                  : step.severity === 'MEDIUM'
                  ? '#fbbf24'
                  : '#38bdf8';
                return (
                  <div
                    key={step.id || idx}
                    style={{
                      display: 'flex',
                      gap: 6,
                      fontSize: 8.5,
                      padding: '4px 6px',
                      marginBottom: 3,
                      background: 'rgba(15, 23, 42, 0.7)',
                      borderLeft: `2.5px solid ${sColor}`,
                      borderRadius: 2,
                    }}
                  >
                    <span style={{ color: '#64748b', minWidth: 46 }}>{step.time}</span>
                    <strong style={{ color: sColor, minWidth: 46 }}>{step.camera_id}</strong>
                    <span style={{ color: '#e2e8f0' }}>{step.event}</span>
                  </div>
                );
              })
            ) : (
              <div style={{ fontSize: 8.5, color: '#64748b', padding: '6px 0' }}>
                Awaiting cross-camera security events...
              </div>
            )}
          </div>

          {/* Incident Snapshot Preservation (Section 19) */}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 6 }}>
            <div style={{ fontSize: 9, color: '#fbbf24', fontWeight: 700, marginBottom: 4 }}>
              📷 PRESERVED INCIDENT SNAPSHOT EVIDENCE (HIGH / CRITICAL):
            </div>
            {snapshotsList.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxHeight: 110, overflowY: 'auto' }}>
                {snapshotsList.slice(0, 3).map((snap, idx) => (
                  <div
                    key={snap.snapshot_id || idx}
                    style={{
                      display: 'flex',
                      gap: 8,
                      alignItems: 'center',
                      padding: '5px 7px',
                      background: 'rgba(9, 15, 28, 0.9)',
                      border: '1px solid rgba(251, 191, 36, 0.3)',
                      borderRadius: 3,
                      fontSize: 8.5,
                    }}
                  >
                    {snap.snapshot_url && (
                      <img
                        src={snap.snapshot_url}
                        alt="Incident Evidence"
                        style={{ width: 64, height: 38, objectFit: 'cover', borderRadius: 2, border: '1px solid #fbbf24' }}
                      />
                    )}
                    <div style={{ flex: 1 }}>
                      <div style={{ color: '#f8fafc', fontWeight: 700 }}>
                        {snap.source_camera} | {snap.event_type} | Risk: {snap.risk_score}/100
                      </div>
                      <div style={{ color: '#94a3b8' }}>
                        Track: {snap.track_id} ({snap.confidence}%) | Time: {snap.timestamp} | Zone: {snap.zone}
                      </div>
                      <div style={{ color: '#fbbf24' }}>
                        Objects: {(snap.detected_objects || []).join(', ')}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 8.5, color: '#64748b' }}>
                Snapshots are automatically preserved when HIGH or CRITICAL events occur.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Expanded AI Camera View (fullscreen modal) */}
      {expandedCam && (
        <ExpandedCameraView
          cameraId={expandedCam.id}
          cameraUrl={expandedCam.url || (expandedCam.id === 'CAM-01' ? '/video_feed/cam1' : `/video_feed/${expandedCam.id.toLowerCase().replace('-', '')}`)}
          videoStream={expandedCam.id === 'CAM-01' ? streamRef.current : null}
          isCameraActive={expandedCam.id === 'CAM-01' ? isCameraActive : false}
          aiTelemetry={aiTelemetry}
          onClose={() => setExpandedCam(null)}
        />
      )}

      {/* Object Inspection Panel (fixed bottom-right) */}
      <ObjectInspectionPanel
        obj={inspectedObject}
        onClose={() => setInspectedObject(null)}
      />
    </div>
  );
}
