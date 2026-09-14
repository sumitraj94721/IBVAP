/**
 * IBVAP - Intelligent Border Video Analytics Platform (SIH 26187)
 * Phase 1: Security Operations Center Dashboard Engine
 * Handles Camera Ingestion, Device Switcher, Canvas Overlays & WebSocket Alerts
 */

class SOCDashboardManager {
  constructor() {
    // CAM-01 Elements
    this.cam1Video = document.getElementById("cam1-video");
    this.cam1Canvas = document.getElementById("cam1-overlay");
    this.cam1Ctx = this.cam1Canvas ? this.cam1Canvas.getContext("2d") : null;
    this.cam1Select = document.getElementById("cam1-device-select");

    // Telemetry Elements
    this.clockTimeEl = document.getElementById("clock-time");
    this.clockDateEl = document.getElementById("clock-date");
    this.alertFeedEl = document.getElementById("alert-feed-scroll");

    // KPI Elements
    this.kpiCameras = document.getElementById("kpi-cameras");
    this.kpiAlerts = document.getElementById("kpi-alerts");
    this.kpiIntrusions = document.getElementById("kpi-intrusions");
    this.kpiPersons = document.getElementById("kpi-persons");
    this.kpiVehicles = document.getElementById("kpi-vehicles");
    this.kpiStatus = document.getElementById("kpi-status");

    // Audio synthesizer for alerts
    this.audioCtx = null;

    // State
    this.currentStream = null;
    this.currentDeviceId = null;
    this.websocket = null;
    this.isWsConnected = false;
    this.fpsCounters = { cam1: 0, cam2: 25, cam3: 25, cam4: 25 };
    this.cam1FrameCount = 0;
    this.cam1FpsTimer = performance.now();
    this.demoTripwireActive = false;

    this.init();
  }

  async init() {
    this.initClock();
    this.initButtons();
    await this.initWebcam();
    await this.enumerateCameras();
    this.initWebSocket();
    this.startOverlayRenderLoop();
  }

  /* -----------------------------------------------------------
     1. Live Master Clock with Milliseconds
     ----------------------------------------------------------- */
  initClock() {
    const update = () => {
      const now = new Date();
      const h = String(now.getHours()).padStart(2, "0");
      const m = String(now.getMinutes()).padStart(2, "0");
      const s = String(now.getSeconds()).padStart(2, "0");
      const ms = String(now.getMilliseconds()).padStart(3, "0");

      const timeStr = `${h}:${m}:${s}.${ms}`;
      const dateStr = now.toISOString().split("T")[0] + " [IST / UTC+05:30]";

      if (this.clockTimeEl) this.clockTimeEl.textContent = timeStr;
      if (this.clockDateEl) this.clockDateEl.textContent = dateStr;

      // Update per-panel millisecond timestamps
      document.querySelectorAll(".panel-live-ts").forEach((el) => {
        el.textContent = `${h}:${m}:${s}.${ms.slice(0, 2)}`;
      });
    };
    setInterval(update, 40);
    update();
  }

  /* -----------------------------------------------------------
     2. Camera Ingestion & Device Enumeration for CAM-01
     ----------------------------------------------------------- */
  async enumerateCameras() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      console.warn("Device enumeration not supported in this browser environment.");
      return;
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter((d) => d.kind === "videoinput");

      if (this.cam1Select) {
        this.cam1Select.innerHTML = "";
        videoInputs.forEach((device, idx) => {
          const opt = document.createElement("option");
          opt.value = device.deviceId;
          opt.text = device.label || `Optical Input #${idx + 1}`;
          if (device.deviceId === this.currentDeviceId) {
            opt.selected = true;
          }
          this.cam1Select.appendChild(opt);
        });

        if (videoInputs.length === 0) {
          const opt = document.createElement("option");
          opt.text = "Default Video Sensor";
          this.cam1Select.appendChild(opt);
        }

        this.cam1Select.addEventListener("change", async (e) => {
          this.currentDeviceId = e.target.value;
          await this.initWebcam(this.currentDeviceId);
        });
      }
    } catch (err) {
      console.warn("Error enumerating devices:", err);
    }
  }

  async initWebcam(deviceId = null) {
    if (this.currentStream) {
      this.currentStream.getTracks().forEach((track) => track.stop());
    }

    const constraints = {
      video: {
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 }
      },
      audio: false
    };

    if (deviceId) {
      constraints.video.deviceId = { exact: deviceId };
    }

    try {
      this.currentStream = await navigator.mediaDevices.getUserMedia(constraints);
      if (this.cam1Video) {
        this.cam1Video.srcObject = this.currentStream;
        await new Promise((resolve) => {
          this.cam1Video.onloadedmetadata = () => {
            this.syncCanvasDimensions();
            resolve();
          };
        });
      }
      this.logAlert("CAM-01 [LOCAL]", "INFO", "Webcam hardware optical sensor locked (1280x720 @ 30 FPS).");
    } catch (err) {
      console.warn("Webcam access warning:", err);
      this.logAlert("CAM-01 [LOCAL]", "ALERT", `Camera Access Request: ${err.message}. Check browser permissions.`);
    }
  }

  syncCanvasDimensions() {
    if (this.cam1Video && this.cam1Canvas) {
      const vw = this.cam1Video.videoWidth || 640;
      const vh = this.cam1Video.videoHeight || 360;
      this.cam1Canvas.width = vw;
      this.cam1Canvas.height = vh;
    }
  }

  /* -----------------------------------------------------------
     3. Tactical Overlay Canvas (Scaffold for Bounding Boxes & Zones)
     ----------------------------------------------------------- */
  startOverlayRenderLoop() {
    const render = (now) => {
      // Calculate true CAM-01 rendering FPS
      this.cam1FrameCount++;
      if (now - this.cam1FpsTimer >= 1000) {
        this.fpsCounters.cam1 = Math.round((this.cam1FrameCount * 1000) / (now - this.cam1FpsTimer));
        this.cam1FrameCount = 0;
        this.cam1FpsTimer = now;
        const fpsEl = document.getElementById("cam1-fps");
        if (fpsEl) fpsEl.textContent = `${this.fpsCounters.cam1} FPS`;
      }

      // Draw overlay features on CAM-01
      if (this.cam1Ctx && this.cam1Canvas && this.cam1Canvas.width > 0) {
        this.drawCam1Overlay(now);
      }

      requestAnimationFrame(render);
    };
    requestAnimationFrame(render);
  }

  drawCam1Overlay(timestamp) {
    const ctx = this.cam1Ctx;
    const w = this.cam1Canvas.width;
    const h = this.cam1Canvas.height;

    ctx.clearRect(0, 0, w, h);

    // 1. Grid coordinates & optical status
    ctx.font = "bold 13px 'JetBrains Mono', monospace";
    ctx.fillStyle = "#00f0ff";
    ctx.fillText("AI ANALYTICS ENGINE: ARMED [PHASE 1 SCAFFOLD]", 24, 34);

    // 2. Scaffold Zone 1: Virtual Border Security Exclusion Polygon (dotted polygon zone)
    ctx.save();
    ctx.strokeStyle = "rgba(0, 240, 255, 0.4)";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 6]);

    const poly = [
      [w * 0.15, h * 0.25],
      [w * 0.85, h * 0.25],
      [w * 0.90, h * 0.88],
      [w * 0.10, h * 0.88]
    ];

    ctx.beginPath();
    ctx.moveTo(poly[0][0], poly[0][1]);
    for (let i = 1; i < poly.length; i++) {
      ctx.lineTo(poly[i][0], poly[i][1]);
    }
    ctx.closePath();
    ctx.stroke();

    ctx.fillStyle = "rgba(0, 240, 255, 0.04)";
    ctx.fill();

    // Polygon Zone Tag
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
    ctx.fillRect(w * 0.15, h * 0.25 - 20, 190, 20);
    ctx.strokeStyle = "#00f0ff";
    ctx.lineWidth = 1;
    ctx.strokeRect(w * 0.15, h * 0.25 - 20, 190, 20);

    ctx.fillStyle = "#00f0ff";
    ctx.font = "bold 11px 'JetBrains Mono', monospace";
    ctx.fillText("ZONE A: RESTRICTED BUFFER", w * 0.15 + 8, h * 0.25 - 6);

    // 3. Tripwire Virtual Line across lower boundary
    const tripwireY = h * 0.72;
    ctx.strokeStyle = this.demoTripwireActive ? "#ef4444" : "rgba(245, 158, 11, 0.75)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w * 0.1, tripwireY);
    ctx.lineTo(w * 0.9, tripwireY);
    ctx.stroke();

    // Tripwire tag
    ctx.fillStyle = this.demoTripwireActive ? "#ef4444" : "#f59e0b";
    ctx.fillText(
      this.demoTripwireActive ? "TRIPWIRE-01: BREACH DETECTED!" : "TRIPWIRE-01 [VIRTUAL LINE]",
      w * 0.1,
      tripwireY - 6
    );

    ctx.restore();
  }

  /* -----------------------------------------------------------
     4. WebSocket Hub for Real-Time Alerts
     ----------------------------------------------------------- */
  initWebSocket() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host || "127.0.0.1:8000";
    const wsUrl = `${protocol}//${host}/ws/alerts`;

    this.websocket = new WebSocket(wsUrl);

    this.websocket.onopen = () => {
      this.isWsConnected = true;
      const statusEl = document.getElementById("link-status-badge");
      if (statusEl) {
        statusEl.textContent = "CONNECTED";
        statusEl.style.color = "var(--status-green)";
      }
      this.logAlert("SOC-HUB", "INFO", "Encrypted telemetry link established with central server.");
    };

    this.websocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "connection_ack" || data.type === "heartbeat") {
          if (data.kpis) this.updateKpis(data.kpis);
          if (data.log_sample) {
            this.logAlert(data.log_sample.source, data.log_sample.level, data.log_sample.msg);
          }
        }

        if (data.type === "alert_event") {
          this.demoTripwireActive = true;
          setTimeout(() => (this.demoTripwireActive = false), 4000);
          this.playAlertTone();
          if (data.event) {
            this.logAlert(data.event.source, data.event.level, data.event.msg);
          }
          if (data.kpis) this.updateKpis(data.kpis);
        }
      } catch (err) {
        console.error("WS Parse Error:", err);
      }
    };

    this.websocket.onclose = () => {
      this.isWsConnected = false;
      const statusEl = document.getElementById("link-status-badge");
      if (statusEl) {
        statusEl.textContent = "DISCONNECTED";
        statusEl.style.color = "var(--alert-red)";
      }
      setTimeout(() => this.initWebSocket(), 2500);
    };
  }

  updateKpis(kpi) {
    if (this.kpiCameras && kpi.total_cameras) this.kpiCameras.textContent = kpi.total_cameras;
    if (this.kpiAlerts && kpi.active_alerts !== undefined) this.kpiAlerts.textContent = kpi.active_alerts;
    if (this.kpiIntrusions && kpi.intrusions !== undefined) this.kpiIntrusions.textContent = kpi.intrusions;
    if (this.kpiPersons && kpi.persons_detected !== undefined) this.kpiPersons.textContent = kpi.persons_detected;
    if (this.kpiVehicles && kpi.vehicles_logged !== undefined) this.kpiVehicles.textContent = kpi.vehicles_logged;
    if (this.kpiStatus && kpi.system_status) this.kpiStatus.textContent = kpi.system_status;
  }

  logAlert(source, level, msg) {
    if (!this.alertFeedEl) return;

    const timeStr = new Date().toTimeString().split(" ")[0];
    const entry = document.createElement("div");
    entry.className = `log-entry level-${level}`;
    entry.innerHTML = `
      <span class="log-time">[${timeStr}]</span>
      <span class="log-source">[${source}]</span>
      <span class="log-msg">${msg}</span>
    `;

    this.alertFeedEl.insertBefore(entry, this.alertFeedEl.firstChild);
    while (this.alertFeedEl.children.length > 25) {
      this.alertFeedEl.removeChild(this.alertFeedEl.lastChild);
    }
  }

  playAlertTone() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!this.audioCtx) this.audioCtx = new AudioContext();
      if (this.audioCtx.state === "suspended") this.audioCtx.resume();

      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(800, this.audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(400, this.audioCtx.currentTime + 0.25);
      gain.gain.setValueAtTime(0.15, this.audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.25);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start();
      osc.stop(this.audioCtx.currentTime + 0.25);
    } catch (e) {
      console.warn("Audio error:", e);
    }
  }

  /* -----------------------------------------------------------
     5. Panel Maximize & UI Controls
     ----------------------------------------------------------- */
  initButtons() {
    // Maximize buttons on each CCTV panel
    document.querySelectorAll(".btn-maximize").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const panelId = e.currentTarget.dataset.panel;
        const panel = document.getElementById(panelId);
        if (panel) {
          const isMax = panel.classList.toggle("maximized");
          e.currentTarget.textContent = isMax ? "🗗" : "⛶";
          // Resize canvas if cam1
          if (panelId === "panel-cam1") {
            setTimeout(() => this.syncCanvasDimensions(), 250);
          }
        }
      });
    });

    // Manual Demo Drill Trigger
    const drillBtn = document.getElementById("btn-trigger-drill");
    if (drillBtn) {
      drillBtn.addEventListener("click", () => {
        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
          this.websocket.send(JSON.stringify({ action: "trigger_demo_alert" }));
        } else {
          this.logAlert("OPERATOR", "ALERT", "LOCAL DRILL: Virtual perimeter tripwire breach simulated.");
          this.demoTripwireActive = true;
          this.playAlertTone();
          setTimeout(() => (this.demoTripwireActive = false), 3500);
        }
      });
    }

    // Clear Alert Logs
    const clearBtn = document.getElementById("btn-clear-logs");
    if (clearBtn) {
      clearBtn.addEventListener("click", () => {
        if (this.alertFeedEl) {
          this.alertFeedEl.innerHTML = `
            <div class="log-entry">
              <span class="log-time">[SYSTEM]</span>
              <span class="log-source">[SOC-LOG]</span>
              <span class="log-msg">Audit log cleared. Surveillance feeds active.</span>
            </div>
          `;
        }
      });
    }

    window.addEventListener("resize", () => this.syncCanvasDimensions());
  }
}

// Instantiate on DOM load
window.addEventListener("DOMContentLoaded", () => {
  window.socDashboard = new SOCDashboardManager();
});
