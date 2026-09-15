import React, { useState, useEffect, useRef } from 'react';

export default function LiveSurveillanceGrid({ cameras, alerts }) {
  // Camera Ingestion & Device State
  const [videoDevices, setVideoDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState('');
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [maximizedCam, setMaximizedCam] = useState(null);

  // WebSocket & AI Telemetry State
  const [isWsConnected, setIsWsConnected] = useState(false);
  const [aiTelemetry, setAiTelemetry] = useState({
    latencyMs: 0,
    targets: [],
    faces: [],
    vehicles: [],
    totalFaces: 0,
    highThreats: 0,
  });

  const videoRef = useRef(null);
  const overlayCanvasRef = useRef(null);
  const offscreenCanvasRef = useRef(null);
  const websocketRef = useRef(null);
  const isProcessingFrameRef = useRef(false);
  const streamRef = useRef(null);

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
              setAiTelemetry({
                latencyMs: data.latency_ms || 0,
                targets: data.targets || [],
                faces: data.faces || [],
                vehicles: data.vehicles || [],
                totalFaces: data.total_faces || 0,
                highThreats: data.high_threat_count || 0,
              });
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
  // 5. Render HUD Tactical Overlays on Video Canvas
  // -----------------------------------------------------------------
  useEffect(() => {
    let animId;

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

        // Draw HUD AI Bounding Boxes from FastAPI
        if (aiTelemetry.targets && aiTelemetry.targets.length > 0) {
          aiTelemetry.targets.forEach((target) => {
            const [nx, ny, nw, nh] = target.normalized_box || [0, 0, 0, 0];
            const x = nx * cw;
            const y = ny * ch;
            const w = nw * cw;
            const h = nh * ch;

            const emotion = target.emotion || {};
            const emotionName = emotion.primary_expression || 'Neutral';
            const conf = emotion.confidence || 0;
            const threatProfile = emotion.threat_profile || {};
            const targetId = target.target_id || 'LOC_#1';

            // Theme color by threat status
            const themeColor =
              threatProfile.status === 'HOSTILE'
                ? '#ef4444'
                : threatProfile.status === 'AGITATED' || threatProfile.status === 'SUSPICIOUS'
                ? '#fbbf24'
                : '#10b981';

            // 1. Semi-transparent backdrop
            ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
            ctx.fillRect(x, y, w, h);

            // 2. Corner tech reticles
            const cornerLen = Math.min(22, Math.max(8, w * 0.22));
            ctx.strokeStyle = themeColor;
            ctx.lineWidth = 2.5;
            ctx.lineCap = 'square';

            // Top-Left
            ctx.beginPath();
            ctx.moveTo(x, y + cornerLen);
            ctx.lineTo(x, y);
            ctx.lineTo(x + cornerLen, y);
            ctx.stroke();

            // Top-Right
            ctx.beginPath();
            ctx.moveTo(x + w - cornerLen, y);
            ctx.lineTo(x + w, y);
            ctx.lineTo(x + w, y + cornerLen);
            ctx.stroke();

            // Bottom-Left
            ctx.beginPath();
            ctx.moveTo(x, y + h - cornerLen);
            ctx.lineTo(x, y + h);
            ctx.lineTo(x + cornerLen, y + h);
            ctx.stroke();

            // Bottom-Right
            ctx.beginPath();
            ctx.moveTo(x + w - cornerLen, y + h);
            ctx.lineTo(x + w, y + h);
            ctx.lineTo(x + w, y + h - cornerLen);
            ctx.stroke();

            // 3. Dashed perimeter
            ctx.strokeStyle = themeColor;
            ctx.lineWidth = 1;
            ctx.setLineDash([4, 4]);
            ctx.strokeRect(x, y, w, h);
            ctx.setLineDash([]);

            // 4. Center crosshair
            const cx = x + w / 2;
            const cy = y + h / 2;
            ctx.beginPath();
            ctx.moveTo(cx - 6, cy); ctx.lineTo(cx + 6, cy);
            ctx.moveTo(cx, cy - 6); ctx.lineTo(cx, cy + 6);
            ctx.stroke();

            // 5. Header AI Tag Badge
            ctx.fillStyle = 'rgba(4, 7, 14, 0.92)';
            const tagW = Math.max(140, w);
            ctx.fillRect(x, Math.max(4, y - 22), tagW, 20);
            ctx.fillStyle = themeColor;
            ctx.font = "bold 10px 'JetBrains Mono', monospace";
            ctx.fillText(
              `[${targetId}] ${emotionName.toUpperCase()} (${conf.toFixed(0)}%)`,
              x + 5,
              Math.max(18, y - 8)
            );

            // 6. Facial landmarks (radar points)
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

    const renderSimFeeds = () => {
      frameCount++;
      const time = performance.now() * 0.001;

      // CAM-01 Fallback Simulation (only active if camera is offline)
      const c1 = canvasRefs['CAM-01'].current;
      if (c1 && !isCameraActive) {
        const ctx = c1.getContext('2d');
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
      }

      // CAM-02: GEN-III PHOSPHOR NIGHT VISION (Sector Bravo)
      const c2 = canvasRefs['CAM-02'].current;
      if (c2) {
        const ctx = c2.getContext('2d');
        const w = (c2.width = 480);
        const h = (c2.height = 270);

        ctx.fillStyle = '#031408';
        ctx.fillRect(0, 0, w, h);

        for (let i = 0; i < 180; i++) {
          const rx = Math.random() * w;
          const ry = Math.random() * h;
          ctx.fillStyle = Math.random() > 0.5 ? 'rgba(0, 255, 120, 0.12)' : 'rgba(0, 50, 20, 0.2)';
          ctx.fillRect(rx, ry, 2, 2);
        }

        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let x = 0; x < w; x += 15) {
          ctx.moveTo(x, h * 0.75);
          ctx.lineTo(x + 10, h * 0.75 + Math.sin(x + frameCount * 0.05) * 5);
        }
        ctx.stroke();

        const pX = 260 + Math.sin(time * 0.6) * 90;
        const pY = 140;
        ctx.fillStyle = 'rgba(0, 255, 120, 0.35)';
        ctx.beginPath();
        ctx.arc(pX, pY - 20, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillRect(pX - 12, pY - 8, 24, 45);

        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(pX - 22, pY - 35, 44, 75);

        ctx.fillStyle = 'rgba(0, 20, 10, 0.85)';
        ctx.fillRect(pX - 22, pY - 50, 130, 14);
        ctx.fillStyle = '#fbbf24';
        ctx.font = 'bold 9px "JetBrains Mono", monospace';
        ctx.fillText('SUSPICIOUS MOVEMENT [86%]', pX - 20, pY - 40);
      }

      // CAM-03: FLIR THERMAL IR SENSOR (Sector Charlie)
      const c3 = canvasRefs['CAM-03'].current;
      if (c3) {
        const ctx = c3.getContext('2d');
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
      }

      // CAM-04: ANPR CHECKPOST ALPHA (Sector Delta)
      const c4 = canvasRefs['CAM-04'].current;
      if (c4) {
        const ctx = c4.getContext('2d');
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

      <div className={`cctv-grid-2x2 ${maximizedCam ? 'single-maximized' : ''}`}>
        {cameras.map((cam) => {
          if (maximizedCam && maximizedCam !== cam.id) return null;

          const isCam1 = cam.id === 'CAM-01';
          const isAlerting = alerts.some((a) => a.camera === cam.id && a.severity === 'CRITICAL');

          return (
            <div key={cam.id} className={`cctv-panel ${isAlerting ? 'panel-alert' : ''}`}>
              <div className="panel-hud-header">
                <div className="panel-header-left">
                  <span className="cam-badge">{cam.id}</span>
                  <span className="cam-name">{cam.name}</span>
                </div>

                <div className="panel-header-right">
                  {/* Camera Device Switcher Dropdown for CAM-01 */}
                  {isCam1 && videoDevices.length > 0 && (
                    <select
                      className="tactical-input"
                      style={{
                        fontSize: 10,
                        padding: '2px 6px',
                        height: 24,
                        maxWidth: 160,
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
                  <span>RES: <strong>{isCam1 && isCameraActive ? '1280x720 (RAW)' : cam.resolution}</strong></span>
                  <span style={{ marginLeft: 10 }}>
                    SENSOR: <strong>{isCam1 && isCameraActive ? 'USER OPTICAL WEBCAM' : cam.sensor}</strong>
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
                          marginLeft: 10,
                          color: isWsConnected ? 'var(--status-green)' : 'var(--warning-amber)',
                        }}
                      >
                        {isWsConnected ? '● AI STREAM LINKED' : '○ AI LINK STANDBY'}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="fps-tag">{cam.fps} FPS</span>
                      <span className="status-tag" style={{ marginLeft: 10 }}>
                        STREAM ACTIVE
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
