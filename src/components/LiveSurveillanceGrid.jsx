import React, { useState, useEffect, useRef } from 'react';

export default function LiveSurveillanceGrid({ cameras, alerts }) {
  const [useWebcam, setUseWebcam] = useState(false);
  const [maximizedCam, setMaximizedCam] = useState(null);
  const [webcamError, setWebcamError] = useState('');

  const videoRef = useRef(null);
  const canvasRefs = {
    'CAM-01': useRef(null),
    'CAM-02': useRef(null),
    'CAM-03': useRef(null),
    'CAM-04': useRef(null),
  };

  // Manage webcam stream for CAM-01 if enabled
  useEffect(() => {
    let stream = null;
    if (useWebcam) {
      navigator.mediaDevices?.getUserMedia({ video: { width: 1280, height: 720 }, audio: false })
        .then((s) => {
          stream = s;
          if (videoRef.current) {
            videoRef.current.srcObject = s;
          }
          setWebcamError('');
        })
        .catch((err) => {
          console.warn('Webcam access error:', err);
          setWebcamError('Webcam unavailable or blocked. Running tactical simulation.');
          setUseWebcam(false);
        });
    }

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [useWebcam]);

  // Canvas-based tactical synthetic surveillance simulation loops
  useEffect(() => {
    let animationFrameId;
    let frameCount = 0;

    const renderFeeds = () => {
      frameCount++;
      const time = performance.now() * 0.001;

      // -------------------------------------------------------------
      // CAM-01: OPTICAL SURVEILLANCE FEED (Sector Alpha)
      // -------------------------------------------------------------
      const c1 = canvasRefs['CAM-01'].current;
      if (c1 && !useWebcam) {
        const ctx = c1.getContext('2d');
        const w = c1.width = 480;
        const h = c1.height = 270;

        // Background terrain: twilight mountain border landscape
        const grad = ctx.createLinearGradient(0, 0, 0, h);
        grad.addColorStop(0, '#0a172c');
        grad.addColorStop(0.5, '#132845');
        grad.addColorStop(1, '#08111e');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        // Grid lines / Optical rangefinder
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

        // Perimeter fence silhouettes
        ctx.strokeStyle = 'rgba(100, 116, 139, 0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(0, h * 0.7);
        for (let x = 0; x < w; x += 30) {
          ctx.lineTo(x, h * 0.7 + (x % 60 === 0 ? -15 : 0));
        }
        ctx.stroke();

        // Moving simulated target (Person)
        const targetX = 180 + Math.sin(time * 0.8) * 70;
        const targetY = 120 + Math.cos(time * 0.5) * 15;
        const boxW = 55;
        const boxH = 95;

        // Bounding Box
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.strokeRect(targetX - boxW / 2, targetY - boxH / 2, boxW, boxH);

        // Tech Corner brackets
        const bSize = 6;
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(targetX - boxW / 2, targetY - boxH / 2, bSize, 2);
        ctx.fillRect(targetX - boxW / 2, targetY - boxH / 2, 2, bSize);
        ctx.fillRect(targetX + boxW / 2 - bSize, targetY - boxH / 2, bSize, 2);
        ctx.fillRect(targetX + boxW / 2 - 2, targetY - boxH / 2, 2, bSize);

        // AI Identification Tag
        ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
        ctx.fillRect(targetX - boxW / 2, targetY - boxH / 2 - 22, 120, 18);
        ctx.fillStyle = '#ef4444';
        ctx.font = 'bold 9px "JetBrains Mono", monospace';
        ctx.fillText(`LOC_#01: PERSON 94%`, targetX - boxW / 2 + 4, targetY - boxH / 2 - 9);

        // Optical Scanline
        ctx.fillStyle = 'rgba(0, 240, 255, 0.05)';
        const scanY = (frameCount * 2) % h;
        ctx.fillRect(0, scanY, w, 4);
      }

      // -------------------------------------------------------------
      // CAM-02: GEN-III PHOSPHOR NIGHT VISION (Sector Bravo)
      // -------------------------------------------------------------
      const c2 = canvasRefs['CAM-02'].current;
      if (c2) {
        const ctx = c2.getContext('2d');
        const w = c2.width = 480;
        const h = c2.height = 270;

        // Phosphor green night vision palette
        ctx.fillStyle = '#031408';
        ctx.fillRect(0, 0, w, h);

        // Phosphor noise / grain
        for (let i = 0; i < 200; i++) {
          const rx = Math.random() * w;
          const ry = Math.random() * h;
          ctx.fillStyle = Math.random() > 0.5 ? 'rgba(0, 255, 120, 0.12)' : 'rgba(0, 50, 20, 0.2)';
          ctx.fillRect(rx, ry, 2, 2);
        }

        // Razor wire fence
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let x = 0; x < w; x += 15) {
          ctx.moveTo(x, h * 0.75);
          ctx.lineTo(x + 10, h * 0.75 + Math.sin(x + frameCount * 0.05) * 5);
        }
        ctx.stroke();

        // Moving suspicious silhouette
        const pX = 260 + Math.sin(time * 0.6) * 90;
        const pY = 140;
        ctx.fillStyle = 'rgba(0, 255, 120, 0.35)';
        ctx.beginPath();
        ctx.arc(pX, pY - 20, 10, 0, Math.PI * 2); // head
        ctx.fill();
        ctx.fillRect(pX - 12, pY - 8, 24, 45); // body

        // AI Bounding Box
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(pX - 22, pY - 35, 44, 75);

        ctx.fillStyle = 'rgba(0, 20, 10, 0.85)';
        ctx.fillRect(pX - 22, pY - 50, 125, 14);
        ctx.fillStyle = '#fbbf24';
        ctx.font = 'bold 9px "JetBrains Mono", monospace';
        ctx.fillText('SUSPICIOUS MOVEMENT [86%]', pX - 20, pY - 40);
      }

      // -------------------------------------------------------------
      // CAM-03: FLIR THERMAL IR SENSOR (Sector Charlie - Riverine)
      // -------------------------------------------------------------
      const c3 = canvasRefs['CAM-03'].current;
      if (c3) {
        const ctx = c3.getContext('2d');
        const w = c3.width = 480;
        const h = c3.height = 270;

        // Thermal infrared false-color background (Deep Navy to Purple)
        const tGrad = ctx.createLinearGradient(0, 0, w, h);
        tGrad.addColorStop(0, '#0a0624');
        tGrad.addColorStop(0.6, '#180e3b');
        tGrad.addColorStop(1, '#050212');
        ctx.fillStyle = tGrad;
        ctx.fillRect(0, 0, w, h);

        // Waterway riverine waves
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

        // Intense Thermal Heat Signatures (Orange / Yellow / White glow)
        const heatX = 220 + Math.sin(time * 0.4) * 45;
        const heatY = 165 + Math.cos(time * 0.3) * 10;

        // Thermal Bloom radial gradient
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

        // Critical Warning Bounding Box
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

      // -------------------------------------------------------------
      // CAM-04: ANPR CHECKPOST ALPHA (Sector Delta)
      // -------------------------------------------------------------
      const c4 = canvasRefs['CAM-04'].current;
      if (c4) {
        const ctx = c4.getContext('2d');
        const w = c4.width = 480;
        const h = c4.height = 270;

        // Checkpost asphalt road and barrier
        ctx.fillStyle = '#0e1726';
        ctx.fillRect(0, 0, w, h);

        // Road lanes
        ctx.fillStyle = '#090f19';
        ctx.beginPath();
        ctx.moveTo(w * 0.3, h);
        ctx.lineTo(w * 0.45, 80);
        ctx.lineTo(w * 0.55, 80);
        ctx.lineTo(w * 0.7, h);
        ctx.fill();

        // Laser scan grid on road
        ctx.strokeStyle = 'rgba(0, 240, 255, 0.25)';
        ctx.lineWidth = 1;
        const laserY = 120 + ((frameCount * 3) % 110);
        ctx.beginPath();
        ctx.moveTo(w * 0.25, laserY);
        ctx.lineTo(w * 0.75, laserY);
        ctx.stroke();

        // Approaching Vehicle Box
        const vW = 100;
        const vH = 65;
        const vX = w * 0.5 - vW / 2;
        const vY = 135;

        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = 2;
        ctx.strokeRect(vX, vY, vW, vH);

        // License Plate Tag
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(vX + 25, vY + vH - 16, 50, 12);
        ctx.fillStyle = '#000000';
        ctx.font = 'bold 8px "JetBrains Mono", monospace';
        ctx.fillText('DL-01-AX-9921', vX + 27, vY + vH - 7);

        // ANPR Header tag
        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.fillRect(vX, vY - 20, 120, 16);
        ctx.fillStyle = '#00f0ff';
        ctx.font = 'bold 9px "JetBrains Mono", monospace';
        ctx.fillText('ANPR: MATCH [VEHICLE]', vX + 4, vY - 8);
      }

      animationFrameId = requestAnimationFrame(renderFeeds);
    };

    animationFrameId = requestAnimationFrame(renderFeeds);
    return () => cancelAnimationFrame(animationFrameId);
  }, [useWebcam]);

  return (
    <div className="cctv-grid-container">
      {webcamError && (
        <div className="login-error-banner" style={{ marginBottom: 10 }}>
          ⚠️ {webcamError}
        </div>
      )}

      <div className={`cctv-grid-2x2 ${maximizedCam ? 'single-maximized' : ''}`}>
        {cameras.map((cam) => {
          if (maximizedCam && maximizedCam !== cam.id) return null;

          const isCam1 = cam.id === 'CAM-01';
          const isAlerting = alerts.some((a) => a.camera === cam.id && a.severity === 'CRITICAL');

          return (
            <div 
              key={cam.id} 
              className={`cctv-panel ${isAlerting ? 'panel-alert' : ''}`}
            >
              <div className="panel-hud-header">
                <div className="panel-header-left">
                  <span className="cam-badge">{cam.id}</span>
                  <span className="cam-name">{cam.name}</span>
                </div>
                <div className="panel-header-right">
                  {isCam1 && (
                    <button
                      className="btn-cam-action"
                      onClick={() => setUseWebcam(!useWebcam)}
                      title="Toggle local webcam sensor"
                    >
                      {useWebcam ? 'SWITCH TO SIMULATION' : 'ENABLE LIVE WEBCAM'}
                    </button>
                  )}
                  <div className="rec-indicator">
                    <span className="rec-dot"></span>
                    <span>REC</span>
                  </div>
                  <button
                    className="btn-cam-action"
                    onClick={() => setMaximizedCam(maximizedCam === cam.id ? null : cam.id)}
                    title="Toggle maximize"
                  >
                    {maximizedCam === cam.id ? '⊠ RESTORE' : '⛶ MAX'}
                  </button>
                </div>
              </div>

              <div className="panel-viewport">
                {isCam1 && useWebcam ? (
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="webcam-video"
                  />
                ) : (
                  <canvas
                    ref={canvasRefs[cam.id]}
                    className="feed-canvas"
                  />
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
                  <span>RES: <strong>{cam.resolution}</strong></span>
                  <span style={{ marginLeft: 10 }}>SENSOR: <strong>{cam.sensor}</strong></span>
                </div>
                <div className="footer-meta-right">
                  <span className="fps-tag">{cam.fps} FPS</span>
                  <span className="status-tag" style={{ marginLeft: 10 }}>
                    {cam.status === 'ONLINE' ? 'STREAM ACTIVE' : 'CALIBRATING'}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
