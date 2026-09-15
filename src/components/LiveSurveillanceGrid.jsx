import React, { useState, useEffect, useRef } from 'react';

// ─── Vision Mode Definitions ─────────────────────────────────────────────────
const VISION_MODES = [
  { id: 'DAY',        label: 'DAY',         icon: '☀' },
  { id: 'NIGHT',      label: 'NIGHT VISION', icon: '🌙' },
  { id: 'FOG',        label: 'FOG/DEHAZE',  icon: '🌫' },
  { id: 'THERMAL',    label: 'THERMAL',     icon: '🌡' },
  { id: 'RAIN',       label: 'RAIN ENH.',   icon: '🌧' },
  { id: 'LOWLIGHT',   label: 'LOW LIGHT',   icon: '🔅' },
  { id: 'MONO',       label: 'MONOCHROME',  icon: '⬜' },
  { id: 'ENHANCED',   label: 'ENHANCED',    icon: '✦' },
  { id: 'AIVISION',   label: 'AI VISION',   icon: '⬡' },
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
    LOWLIGHT: 'LOW LIGHT ENHANCED',
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
    case 'LOWLIGHT': return { env: 'LOW LIGHT', vis: 'GAMMA BOOST' };
    case 'MONO': return { env: 'TACTICAL', vis: 'HIGH CONTRAST' };
    case 'ENHANCED': return { env: 'OBSCURED', vis: 'CLAHE ACTIVE' };
    case 'AIVISION': return { env: 'ALL-SPECTRUM', vis: 'AI AUGMENTED' };
    default: return { env: 'CLEAR', vis: 'NOMINAL' };
  }
}

export default function LiveSurveillanceGrid({ cameras, alerts, onAiUpdate }) {
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
    // New AI fields
    objects: [],
    odPersons: [],
    odVehicles: [],
    aiAlerts: [],
    aiEvents: [],
    threatScore: 0,
    zoneIntrusions: 0,
    loiteringCount: 0,
    aiStats: {},
  });

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
                totalFaces: data.total_faces || 0,
                highThreats: data.high_threat_count || 0,
                // New AI fields
                objects: data.objects || [],
                odPersons: data.od_persons || [],
                odVehicles: data.od_vehicles || [],
                aiAlerts: data.ai_alerts || [],
                aiEvents: data.ai_events || [],
                threatScore: data.threat_score || 0,
                zoneIntrusions: data.zone_intrusions || 0,
                loiteringCount: data.loitering_count || 0,
                aiStats: data.ai_stats || {},
              };
              setAiTelemetry(updated);
              // Notify parent (App.jsx) with AI data for alerts/analytics
              if (onAiUpdate) onAiUpdate(updated);
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
            const emotionName = emotion.primary_expression || 'Neutral';
            const conf = target.detection_confidence || emotion.confidence || 0;
            const threatProfile = emotion.threat_profile || {};
            const targetId = target.target_id || 'LOC_#1';
            const ageGroup = target.age_group || '';
            const movement = target.movement || '';
            const direction = target.direction || '';
            const inZone = target.in_restricted_zone || false;
            const loitering = target.loitering || false;
            const dwell = target.dwell_seconds || 0;
            const objectsInHand = target.objects_in_hand || [];
            const threat = target.threat || {};
            const threatScore = threat.score || 0;

            // Color by zone status first, then emotion
            let themeColor = '#10b981'; // green = nominal
            if (loitering) themeColor = '#ef4444';       // red = loitering
            else if (inZone) themeColor = '#fbbf24';     // amber = intrusion
            else if (threatProfile.status === 'HOSTILE') themeColor = '#ef4444';
            else if (threatProfile.status === 'AGITATED' || threatProfile.status === 'SUSPICIOUS') themeColor = '#fbbf24';

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

            // ── HUD info panel (right of bbox or below) ────────────────
            const panelX = Math.min(x, cw - 160);
            const panelY = Math.max(4, y - 4);
            const lines = [];

            // Line 1: Target ID + type
            lines.push({ text: `PERSON ${targetId}`, color: themeColor, bold: true });
            // Line 2: Emotion / confidence
            lines.push({ text: `${emotionName.toUpperCase()}  CONF:${conf.toFixed(0)}%`, color: '#e2e8f0' });
            // Line 3: Age group (heuristic)
            if (ageGroup && ageGroup !== 'UNKNOWN') {
              lines.push({ text: `AGE GRP: ${ageGroup} [EST]`, color: '#94a3b8' });
            }
            // Line 4: Movement direction
            if (movement && movement !== 'STATIONARY') {
              lines.push({ text: `${movement} ▶ ${direction}`, color: '#38bdf8' });
            }
            // Line 5: Objects in hand
            if (objectsInHand.length > 0) {
              const oname = objectsInHand[0].class_name.toUpperCase();
              lines.push({ text: `${oname} — LIKELY IN HAND`, color: '#f59e0b' });
            }
            // Line 6: Zone alert
            if (loitering) {
              lines.push({ text: `⚠ LOITERING ${dwell.toFixed(0)}s`, color: '#ef4444', bold: true });
            } else if (inZone) {
              lines.push({ text: `⚠ RESTRICTED ZONE`, color: '#fbbf24', bold: true });
            }
            // Line 7: Threat score
            if (threatScore > 10) {
              const tLabel = threatScore >= 75 ? 'CRITICAL' : threatScore >= 55 ? 'HIGH' : threatScore >= 30 ? 'MED' : 'LOW';
              lines.push({ text: `THREAT: ${threatScore} [${tLabel}]`, color: threatScore >= 55 ? '#ef4444' : '#fbbf24' });
            }

            // Draw panel background
            const lineH = 13;
            const panelH = lines.length * lineH + 8;
            const panelW = 165;
            ctx.fillStyle = 'rgba(4, 7, 18, 0.88)';
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

        // ── VEHICLE DETECTIONS (from OD) ─────────────────────────────────
        if (aiTelemetry.odVehicles && aiTelemetry.odVehicles.length > 0) {
          aiTelemetry.odVehicles.forEach((veh) => {
            const [nx, ny, nw, nh] = veh.normalized_box || [0, 0, 0, 0];
            const x = nx * cw;
            const y = ny * ch;
            const w = nw * cw;
            const h = nh * ch;
            const vname = (veh.class_name || 'VEHICLE').toUpperCase();
            const vconf = veh.confidence || 0;

            ctx.fillStyle = 'rgba(0, 210, 255, 0.08)';
            ctx.fillRect(x, y, w, h);
            renderCornerReticles(ctx, x, y, w, h, '#00d2ff');
            ctx.strokeStyle = '#00d2ff';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([6, 3]);
            ctx.strokeRect(x, y, w, h);
            ctx.setLineDash([]);

            // Label
            ctx.fillStyle = 'rgba(4, 7, 18, 0.90)';
            const lW = 145;
            ctx.fillRect(x, Math.max(2, y - 20), lW, 18);
            ctx.strokeStyle = '#00d2ff';
            ctx.lineWidth = 1;
            ctx.strokeRect(x, Math.max(2, y - 20), lW, 18);
            ctx.fillStyle = '#00d2ff';
            ctx.font = "bold 9px 'JetBrains Mono', monospace";
            ctx.fillText(`VEHICLE: ${vname}  ${vconf.toFixed(0)}%`, x + 5, Math.max(14, y - 7));
          });
        }

        // ── OBJECT DETECTIONS ─────────────────────────────────────────────
        if (aiTelemetry.objects && aiTelemetry.objects.length > 0) {
          aiTelemetry.objects.forEach((obj) => {
            if (obj.category === 'person') return; // already shown above
            const [nx, ny, nw, nh] = obj.normalized_box || [0, 0, 0, 0];
            const x = nx * cw;
            const y = ny * ch;
            const w = nw * cw;
            const h = nh * ch;
            const oname = (obj.class_name || 'OBJECT').toUpperCase();
            const oconf = obj.confidence || 0;

            ctx.strokeStyle = '#a78bfa';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([3, 3]);
            ctx.strokeRect(x, y, w, h);
            ctx.setLineDash([]);

            ctx.fillStyle = 'rgba(4, 7, 18, 0.85)';
            ctx.fillRect(x, Math.max(2, y - 16), 130, 14);
            ctx.fillStyle = '#a78bfa';
            ctx.font = "9px 'JetBrains Mono', monospace";
            ctx.fillText(`OBJ: ${oname}  ${oconf.toFixed(0)}%`, x + 3, Math.max(12, y - 5));
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
        const odStat = stats.object_detector || 'N/A';
        const personsN = aiTelemetry.totalFaces || 0;
        ctx.fillStyle = 'rgba(4, 7, 18, 0.80)';
        ctx.fillRect(4, ch - 28, 280, 24);
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
        ctx.lineWidth = 1;
        ctx.strokeRect(4, ch - 28, 280, 24);
        ctx.fillStyle = '#00f0ff';
        ctx.font = "8px 'JetBrains Mono', monospace";
        ctx.fillText(
          `FACE-AI: ${personsN}P  OD:${odStat}  LAT:${aiTelemetry.latencyMs?.toFixed(0)||'?'}ms`,
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

  return (
    <div className="cctv-grid-container">
      {cameraError && (
        <div className="login-error-banner" style={{ marginBottom: 10 }}>
          ⚠️ {cameraError}
        </div>
      )}

      {/* Tactical Quick Demo Scenarios Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 6,
          marginBottom: 10,
          padding: '6px 12px',
          background: 'rgba(6, 12, 24, 0.9)',
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
          { id: 'LOW_VISIBILITY', label: 'LOW VISIBILITY', desc: 'Gamma boost + Rain enhancement' },
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

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 9, color: 'var(--text-dim)', fontFamily: 'var(--font-ui)' }}>
            SURVEILLANCE HUD:
          </span>
          <span style={{ fontSize: 10, color: '#00f0ff', fontFamily: 'var(--font-ui)', fontWeight: 600 }}>
            ZERO-LINE ACTIVE
          </span>
        </div>
      </div>

      <div className={`cctv-grid-2x2 ${maximizedCam ? 'single-maximized' : ''}`}>
        {cameras.map((cam) => {
          if (maximizedCam && maximizedCam !== cam.id) return null;

          const isCam1 = cam.id === 'CAM-01';
          const isAlerting = alerts.some((a) => a.camera === cam.id && a.severity === 'CRITICAL');
          const camMode = visionModes[cam.id] || 'DAY';
          const envStatus = getEnvStatus(cam.id, camMode);
          const displayedResolution = cam.id === 'CAM-02'
            ? (cam2Status.resolution || '--')
            : cam.resolution;

          return (
            <div key={cam.id} className={`cctv-panel ${isAlerting ? 'panel-alert' : ''}`}>
              <div className="panel-hud-header">
                <div className="panel-header-left">
                  <span className="cam-badge">{cam.id}</span>
                  <span className="cam-name">{cam.name}</span>
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

                  <button
                    className="btn-cam-action"
                    onClick={() => setMaximizedCam(maximizedCam === cam.id ? null : cam.id)}
                    title="Toggle maximize view"
                  >
                    {maximizedCam === cam.id ? '⊠ RESTORE' : '⛶ MAX'}
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
                        pointerEvents: 'none',
                        display: isCameraActive ? 'block' : 'none',
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
                      <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: '#ef4444', fontFamily: 'var(--font-ui)', letterSpacing: 1 }}>
                        <div style={{ textAlign: 'center' }}>
                          <strong style={{ display: 'block', fontSize: 18 }}>CAM-02</strong>
                          <span style={{ display: 'block', marginTop: 8, fontSize: 12 }}>REMOTE CAMERA OFFLINE</span>
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
                    MODE: <strong style={{ color: 'var(--cyan-glow)' }}>{camMode}</strong>
                  </span>
                  <span style={{ marginLeft: 8 }}>
                    ENV: <strong>{envStatus.env}</strong>
                  </span>
                </div>

                <div className="footer-meta-right">
                  {isCam1 ? (
                    <>
                      <span className="fps-tag">
                        {aiTelemetry.latencyMs > 0 ? `${aiTelemetry.latencyMs}ms LAT` : '30 FPS'}
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
                        AI: <strong style={{ color: 'var(--status-green)' }}>ONLINE</strong>
                      </span>
                    </>
                  ) : cam.id === 'CAM-02' ? (
                    <>
                      <span className="fps-tag">{cam2Status.connected ? `${cam2Status.fps || 0} FPS` : '0 FPS'}</span>
                      <span className="status-tag" style={{ marginLeft: 8, color: cam2Status.connected ? 'var(--status-green)' : '#ef4444' }}>
                        {cam2Status.connected ? '● LIVE' : '○ OFFLINE'}
                      </span>
                      <span style={{ marginLeft: 8, fontSize: 9, color: 'var(--text-dim)' }}>
                        LAT: <strong>{cam2Status.latency_ms != null ? `${Math.round(cam2Status.latency_ms)}ms` : '--'}</strong>
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="fps-tag">{cam.fps} FPS</span>
                      <span className="status-tag" style={{ marginLeft: 8, color: 'var(--status-green)' }}>
                        ● STREAM ACTIVE
                      </span>
                      <span style={{ marginLeft: 8, fontSize: 9, color: 'var(--text-dim)' }}>
                        AI: <strong style={{ color: 'var(--status-green)' }}>ONLINE</strong>
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
