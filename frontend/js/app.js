/**
 * AI Border Surveillance CCTV Command Center (SIH 26187)
 * Frontend Application Controller
 * Handles Camera Ingestion, WebSocket Streaming, Tactical HUD Overlay & Alert Management
 */

class SurveillanceCommandCenter {
  constructor() {
    // DOM Elements
    this.videoEl = document.getElementById("webcam-video");
    this.canvasEl = document.getElementById("hud-canvas");
    this.ctx = this.canvasEl.getContext("2d");

    // UI Controls
    this.cameraSelect = document.getElementById("camera-select");
    this.analyticsToggle = document.getElementById("analytics-toggle");
    this.thresholdSlider = document.getElementById("confidence-slider");
    this.thresholdVal = document.getElementById("slider-val-indicator");
    this.engineSelect = document.getElementById("engine-select");
    this.muteBtn = document.getElementById("mute-toggle-btn");
    this.snapshotBtn = document.getElementById("snapshot-btn");
    this.exportLogBtn = document.getElementById("export-log-btn");
    this.clearAlertsBtn = document.getElementById("clear-alerts-btn");
    this.videoStage = document.getElementById("video-stage");

    // Telemetry displays
    this.fpsCounter = document.getElementById("fps-val");
    this.latencyVal = document.getElementById("latency-val");
    this.faceCountVal = document.getElementById("face-count-val");
    this.threatCountVal = document.getElementById("threat-count-val");
    this.threatStatusBadge = document.getElementById("threat-status-badge");
    this.alertListEl = document.getElementById("alert-feed-list");
    this.threatMeterBlocks = document.querySelectorAll(".threat-block");
    this.networkToggle = document.getElementById("network-toggle");
    this.networkStateLabel = document.getElementById("network-state-label");
    this.syncState = document.getElementById("sync-state");
    this.pendingSyncVal = document.getElementById("pending-sync-val");
    this.plateList = document.getElementById("plate-list");
    this.anprStatus = document.getElementById("anpr-status");

    // State
    this.stream = null;
    this.currentDeviceId = null;
    this.websocket = null;
    this.isWsConnected = false;
    this.isProcessingFrame = false;
    this.latestTargets = [];
    this.latestFaces = [];
    this.latestVehicles = [];
    this.activeAlerts = [];
    this.trackedIds = new Set();
    this.lastFrameTime = performance.now();
    this.fps = 0;
    this.frameCount = 0;
    this.fpsTimer = performance.now();

    // Offscreen Canvas for Frame Extraction
    this.offscreenCanvas = document.createElement("canvas");
    this.offscreenCtx = this.offscreenCanvas.getContext("2d");

    // Config defaults
    this.config = {
      analyticsEnabled: true,
      confidenceThreshold: 0.50,
      engine: "yunet",
      filterMode: "normal"
    };

    this.init();
  }

  async init() {
    this.setupClock();
    this.setupEventListeners();
    await this.initCamera();
    await this.enumerateCameras();
    this.initWebSocket();
    this.startRenderLoop();
  }

  setupClock() {
    const updateTime = () => {
      const now = new Date();
      const timeStr = now.toTimeString().split(" ")[0] + ":" + String(now.getMilliseconds()).padStart(3, "0").slice(0, 2);
      const dateStr = now.toISOString().split("T")[0] + " [UTC+05:30]";
      const timeEl = document.getElementById("live-time");
      const dateEl = document.getElementById("live-date");
      if (timeEl) timeEl.textContent = timeStr;
      if (dateEl) dateEl.textContent = dateStr;
    };
    setInterval(updateTime, 50);
    updateTime();
  }

  setupEventListeners() {
    // Camera switcher
    this.cameraSelect.addEventListener("change", async (e) => {
      this.currentDeviceId = e.target.value;
      await this.initCamera(this.currentDeviceId);
    });

    // Analytics toggle
    this.analyticsToggle.addEventListener("change", (e) => {
      this.config.analyticsEnabled = e.target.checked;
      this.sendWsConfig();
      if (!this.config.analyticsEnabled) {
        this.latestTargets = [];
        this.updateHUDStats(0, 0, 0);
      }
    });

    // Confidence threshold slider
    this.thresholdSlider.addEventListener("input", (e) => {
      const val = parseInt(e.target.value, 10);
      this.config.confidenceThreshold = val / 100.0;
      this.thresholdVal.textContent = `${val}%`;
      this.sendWsConfig();
    });

    // Detector engine selector
    this.engineSelect.addEventListener("change", (e) => {
      this.config.engine = e.target.value;
      this.sendWsConfig();
    });

    // Audio Mute toggle
    this.muteBtn.addEventListener("click", () => {
      const isMuted = window.tacticalAudio.toggleMute();
      this.muteBtn.innerHTML = isMuted ? "🔇 AUDIO OFF" : "🔊 AUDIO ON";
      this.muteBtn.classList.toggle("btn-danger", isMuted);
    });

    // Filter mode buttons
    document.querySelectorAll(".filter-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        document.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
        const target = e.currentTarget;
        target.classList.add("active");
        const filter = target.dataset.filter;
        this.config.filterMode = filter;
        this.videoStage.className = `video-stage filter-${filter}`;
      });
    });

    // Snapshot button
    this.snapshotBtn.addEventListener("click", () => this.takeSnapshot());

    // Export log button
    this.exportLogBtn.addEventListener("click", () => this.exportAlertLog());

    // Clear alerts button
    this.clearAlertsBtn.addEventListener("click", () => {
      this.activeAlerts = [];
      this.alertListEl.innerHTML = `
        <div class="alert-item">
          <div class="alert-time">[SYS_INIT]</div>
          <div class="alert-msg">Surveillance logging cleared. Monitoring active perimeter.</div>
        </div>
      `;
    });

    if (this.networkToggle) {
      this.networkToggle.addEventListener("change", async (event) => {
        await fetch("/api/sync/network", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ online: event.target.checked })
        });
        this.updateSyncUI({ online: event.target.checked, pending_sync: this.pendingSyncVal ? parseInt(this.pendingSyncVal.textContent, 10) || 0 : 0 });
        this.sendWsConfig();
      });
    }
  }

  async enumerateCameras() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((d) => d.kind === "videoinput");

      this.cameraSelect.innerHTML = "";
      videoDevices.forEach((device, index) => {
        const option = document.createElement("option");
        option.value = device.deviceId;
        option.text = device.label || `Tactical Camera Unit #${index + 1}`;
        if (device.deviceId === this.currentDeviceId) {
          option.selected = true;
        }
        this.cameraSelect.appendChild(option);
      });

      if (videoDevices.length === 0) {
        const option = document.createElement("option");
        option.text = "No cameras detected";
        this.cameraSelect.appendChild(option);
      }
    } catch (err) {
      console.warn("Could not enumerate camera devices:", err);
    }
  }

  async initCamera(deviceId = null) {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
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
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.videoEl.srcObject = this.stream;

      await new Promise((resolve) => {
        this.videoEl.onloadedmetadata = () => {
          this.resizeCanvas();
          resolve();
        };
      });

      window.addEventListener("resize", () => this.resizeCanvas());
      this.addAlertItem("CAM-01", "Optical link established. Resolution 1280x720 @ 30 FPS.", false);
    } catch (err) {
      console.error("Webcam access error:", err);
      this.addAlertItem("SYSTEM", `Hardware Access Error: ${err.message}. Ensure camera permissions are granted.`, true);
    }
  }

  resizeCanvas() {
    if (this.videoEl.videoWidth > 0 && this.videoEl.videoHeight > 0) {
      this.canvasEl.width = this.videoEl.videoWidth;
      this.canvasEl.height = this.videoEl.videoHeight;
      this.offscreenCanvas.width = 640;
      this.offscreenCanvas.height = Math.round((640 * this.videoEl.videoHeight) / this.videoEl.videoWidth);
    }
  }

  initWebSocket() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host || "127.0.0.1:8000";
    const wsUrl = `${protocol}//${host}/ws/stream`;

    console.log("Connecting to CCTV WebSocket:", wsUrl);
    this.websocket = new WebSocket(wsUrl);

    this.websocket.onopen = () => {
      this.isWsConnected = true;
      console.log("CCTV WebSocket Connected.");
      document.getElementById("ws-status-indicator").textContent = "ONLINE";
      document.getElementById("ws-status-indicator").style.color = "var(--accent-green)";
      this.sendWsConfig();
    };

    this.websocket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "telemetry") {
          this.handleTelemetry(data);
        }
      } catch (err) {
        console.error("WS parse error:", err);
      } finally {
        this.isProcessingFrame = false;
      }
    };

    this.websocket.onerror = (err) => {
      console.warn("WebSocket error:", err);
      this.isProcessingFrame = false;
    };

    this.websocket.onclose = () => {
      this.isWsConnected = false;
      document.getElementById("ws-status-indicator").textContent = "DISCONNECTED";
      document.getElementById("ws-status-indicator").style.color = "var(--accent-red)";
      // Reconnect after 2 seconds
      setTimeout(() => this.initWebSocket(), 2000);
    };
  }

  sendWsConfig() {
    if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
      this.websocket.send(
        JSON.stringify({
          type: "config",
          analytics_enabled: this.config.analyticsEnabled,
          confidence_threshold: this.config.confidenceThreshold,
          engine: this.config.engine,
          network_online: this.networkToggle ? this.networkToggle.checked : true
        })
      );
    }
  }

  captureAndSendFrame() {
    if (
      !this.config.analyticsEnabled ||
      !this.isWsConnected ||
      this.isProcessingFrame ||
      !this.videoEl ||
      this.videoEl.readyState < 2
    ) {
      return;
    }

    try {
      this.isProcessingFrame = true;

      // Draw mirrored video frame to offscreen canvas
      const ow = this.offscreenCanvas.width;
      const oh = this.offscreenCanvas.height;

      this.offscreenCtx.save();
      // Mirror horizontally to match the mirrored display
      this.offscreenCtx.translate(ow, 0);
      this.offscreenCtx.scale(-1, 1);
      this.offscreenCtx.drawImage(this.videoEl, 0, 0, ow, oh);
      this.offscreenCtx.restore();

      const jpegData = this.offscreenCanvas.toDataURL("image/jpeg", 0.65);

      this.websocket.send(
        JSON.stringify({
          type: "frame",
          image: jpegData,
          confidence_threshold: this.config.confidenceThreshold,
          engine: this.config.engine
        })
      );
    } catch (err) {
      console.warn("Frame capture error:", err);
      this.isProcessingFrame = false;
    }
  }

  handleTelemetry(data) {
    this.latestTargets = data.targets || [];
    this.latestFaces = data.faces || [];
    this.latestVehicles = data.vehicles || [];
    const latency = data.latency_ms || 0;
    const totalFaces = data.total_faces || 0;
    const highThreats = data.high_threat_count || 0;

    this.updateHUDStats(totalFaces, highThreats, latency);
    this.updateSyncUI(data.sync || {});
    this.updateANPR(data.vehicles || []);

    // Process alerts
    if (data.alerts && data.alerts.length > 0) {
      data.alerts.forEach((alert) => {
        const msg = `Anomaly/Agitation detected - Emotion: ${alert.expression} (${alert.confidence.toFixed(0)}%) [${alert.target_id}]`;
        this.addAlertItem("CAM-01", msg, true);
        window.tacticalAudio.playThreatAlarm();
      });
    }

    // Sound cue when a new target is locked
    this.latestTargets.forEach((target) => {
      if (!this.trackedIds.has(target.target_id)) {
        this.trackedIds.add(target.target_id);
        window.tacticalAudio.playTargetLock();
        this.addAlertItem("CAM-01", `Target ${target.target_id} acquired. Expression: ${target.emotion.primary_expression} (${target.emotion.confidence.toFixed(0)}%)`, false);
      }
    });
  }

  updateHUDStats(totalFaces, highThreats, latency) {
    if (this.latencyVal) this.latencyVal.textContent = `${latency.toFixed(0)} ms`;
    if (this.faceCountVal) this.faceCountVal.textContent = totalFaces;
    if (this.threatCountVal) this.threatCountVal.textContent = highThreats;

    // Threat Meter State
    let statusText = "NOMINAL";
    let statusColor = "var(--accent-green)";

    this.threatMeterBlocks.forEach((b) => (b.className = "threat-block"));

    if (highThreats > 0) {
      statusText = "HIGH ALERT";
      statusColor = "var(--accent-red)";
      this.threatMeterBlocks[0].classList.add("active-red");
      this.threatMeterBlocks[1].classList.add("active-red");
      this.threatMeterBlocks[2].classList.add("active-red");
      this.threatMeterBlocks[3].classList.add("active-red");
    } else if (totalFaces > 0) {
      statusText = "MONITORING";
      statusColor = "var(--accent-green)";
      this.threatMeterBlocks[0].classList.add("active-green");
      this.threatMeterBlocks[1].classList.add("active-green");
    } else {
      this.threatMeterBlocks[0].classList.add("active-green");
    }

    if (this.threatStatusBadge) {
      this.threatStatusBadge.textContent = statusText;
      this.threatStatusBadge.style.color = statusColor;
    }
  }

  updateSyncUI(sync) {
    const online = sync.online !== false;
    const pending = Number(sync.pending_sync || 0);
    if (this.pendingSyncVal) this.pendingSyncVal.textContent = `${pending} EVENTS`;
    if (this.networkToggle) this.networkToggle.checked = online;
    if (this.networkStateLabel) this.networkStateLabel.textContent = online ? "ONLINE" : "OFFLINE";
    if (this.syncState) this.syncState.textContent = online ? (pending ? "SYNCING BUFFER" : "CENTRAL LINK ACTIVE") : "BUFFERING LOCALLY";
    if (this.networkStateLabel) this.networkStateLabel.style.color = online ? "var(--accent-green)" : "var(--accent-amber)";
  }

  updateANPR(vehicles) {
    if (!this.plateList || !this.anprStatus) return;
    this.anprStatus.textContent = vehicles.length ? `${vehicles.length} VEHICLE PLATE(S) LOCKED` : "PLATE SENSOR STANDBY";
    this.plateList.innerHTML = vehicles.length ? vehicles.map((vehicle) => `
      <div class="plate-entry">
        <span class="plate-object">${vehicle.object_type} ${(vehicle.confidence || 0).toFixed(0)}%</span>
        <strong>${vehicle.plate}</strong>
      </div>`).join("") : '<div class="plate-empty">No qualifying vehicle detections</div>';
  }

  addAlertItem(source, message, isThreat = false) {
    const now = new Date();
    const timeStr = now.toTimeString().split(" ")[0];

    const item = {
      timestamp: timeStr,
      source: source,
      message: message,
      isThreat: isThreat
    };

    this.activeAlerts.unshift(item);
    if (this.activeAlerts.length > 50) this.activeAlerts.pop();

    const el = document.createElement("div");
    el.className = `alert-item ${isThreat ? "alert-threat" : ""}`;
    el.innerHTML = `
      <div class="alert-time">[${timeStr}] ${source}</div>
      <div class="alert-msg">${isThreat ? "⚠️ <strong>" + message + "</strong>" : message}</div>
    `;

    this.alertListEl.insertBefore(el, this.alertListEl.firstChild);
    while (this.alertListEl.children.length > 30) {
      this.alertListEl.removeChild(this.alertListEl.lastChild);
    }
  }

  startRenderLoop() {
    const loop = (currentTime) => {
      // Calculate FPS
      this.frameCount++;
      if (currentTime - this.fpsTimer >= 1000) {
        this.fps = Math.round((this.frameCount * 1000) / (currentTime - this.fpsTimer));
        this.frameCount = 0;
        this.fpsTimer = currentTime;
        if (this.fpsCounter) this.fpsCounter.textContent = `${this.fps} FPS`;
      }

      // Stream frames to backend every ~33ms (target ~30 FPS)
      if (currentTime - this.lastFrameTime >= 33) {
        this.lastFrameTime = currentTime;
        this.captureAndSendFrame();
      }

      // Render Tactical HUD
      this.renderCanvasHUD();

      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  renderCanvasHUD() {
    const cw = this.canvasEl.width;
    const ch = this.canvasEl.height;

    this.ctx.clearRect(0, 0, cw, ch);

    if (!this.config.analyticsEnabled) {
      return;
    }

    // Render each detected and tracked face
    this.latestTargets.forEach((target) => {
      const [nx, ny, nw, nh] = target.normalized_box;
      // Since video is mirrored in UI, compute flipped X coordinate
      // normX from backend is based on the mirrored frame sent
      const x = nx * cw;
      const y = ny * ch;
      const w = nw * cw;
      const h = nh * ch;

      const emotionData = target.emotion;
      const emotionName = emotionData.primary_expression;
      const conf = emotionData.confidence;
      const threatProfile = emotionData.threat_profile;
      const targetId = target.target_id || "LOC_#01";

      const themeColor = threatProfile.color || "#00ff88";

      this.drawTacticalBoundingBox(x, y, w, h, targetId, emotionName, conf, themeColor, threatProfile.status);

      // Draw Facial Landmarks if provided
      if (target.landmarks && target.landmarks.length > 0) {
        this.drawLandmarks(target.landmarks, cw, ch);
      }
    });

    this.latestFaces.forEach((face) => {
      const [x, y, w, h] = face.box;
      this.drawFaceBadge(x, y, w, h, face.tag || "FACE DETECTED (CONF: 92%)");
    });
    this.latestVehicles.forEach((vehicle) => {
      const [x, y, w, h] = vehicle.box;
      this.drawVehicleBadge(x, y, w, h, vehicle.hud);
    });
  }

  drawFaceBadge(x, y, w, h, label) {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = "#00d2ff";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = "rgba(4, 7, 10, 0.88)";
    ctx.fillRect(x, Math.max(4, y - 22), Math.max(170, w), 20);
    ctx.fillStyle = "#00d2ff";
    ctx.font = "bold 10px 'JetBrains Mono', monospace";
    ctx.fillText(label, x + 6, Math.max(18, y - 8));
    ctx.restore();
  }

  drawVehicleBadge(x, y, w, h, label) {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = "#ffaa00";
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = "rgba(4, 7, 10, 0.9)";
    ctx.fillRect(x, y + h + 4, Math.max(230, w), 20);
    ctx.fillStyle = "#ffaa00";
    ctx.font = "bold 10px 'JetBrains Mono', monospace";
    ctx.fillText(label, x + 6, y + h + 18);
    ctx.restore();
  }

  drawTacticalBoundingBox(x, y, w, h, targetId, emotion, confidence, color, statusText) {
    const ctx = this.ctx;
    const cornerLength = Math.min(24, Math.max(12, w * 0.2));
    const pad = 4;

    ctx.save();

    // 1. Subtle semi-transparent box background
    ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
    ctx.fillRect(x - pad, y - pad, w + pad * 2, h + pad * 2);

    // 2. Tactical Sharp Tech Brackets (Corners)
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.lineCap = "square";

    const bx = x - pad;
    const by = y - pad;
    const bw = w + pad * 2;
    const bh = h + pad * 2;

    // Top-Left
    ctx.beginPath();
    ctx.moveTo(bx, by + cornerLength);
    ctx.lineTo(bx, by);
    ctx.lineTo(bx + cornerLength, by);
    ctx.stroke();

    // Top-Right
    ctx.beginPath();
    ctx.moveTo(bx + bw - cornerLength, by);
    ctx.lineTo(bx + bw, by);
    ctx.lineTo(bx + bw, by + cornerLength);
    ctx.stroke();

    // Bottom-Left
    ctx.beginPath();
    ctx.moveTo(bx, by + bh - cornerLength);
    ctx.lineTo(bx, by + bh);
    ctx.lineTo(bx + cornerLength, by + bh);
    ctx.stroke();

    // Bottom-Right
    ctx.beginPath();
    ctx.moveTo(bx + bw - cornerLength, by + bh);
    ctx.lineTo(bx + bw, by + bh);
    ctx.lineTo(bx + bw, by + bh - cornerLength);
    ctx.stroke();

    // 3. Subtle Dashed Perimeter
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 6]);
    ctx.strokeRect(bx, by, bw, bh);
    ctx.setLineDash([]);

    // 4. Center Crosshair within Bounding Box
    const cx = bx + bw / 2;
    const cy = by + bh / 2;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 8, cy);
    ctx.lineTo(cx + 8, cy);
    ctx.moveTo(cx, cy - 8);
    ctx.lineTo(cx, cy + 8);
    ctx.stroke();

    // 5. Tactical Badge Tag (Positioned directly above the box)
    const badgeHeight = 36;
    const badgeWidth = Math.max(160, bw);
    const badgeY = Math.max(10, by - badgeHeight - 6);

    // Badge Background
    ctx.fillStyle = "rgba(10, 14, 20, 0.92)";
    ctx.fillRect(bx, badgeY, badgeWidth, badgeHeight);

    // Badge Border & Accent Edge
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(bx, badgeY, badgeWidth, badgeHeight);

    ctx.fillStyle = color;
    ctx.fillRect(bx, badgeY, 4, badgeHeight); // Left indicator stripe

    // Typography
    ctx.font = "bold 11px 'JetBrains Mono', monospace";
    ctx.fillStyle = "#ffffff";
    ctx.fillText(`[TARGET ID: ${targetId}]`, bx + 10, badgeY + 14);

    ctx.font = "10px 'JetBrains Mono', monospace";
    ctx.fillStyle = color;
    ctx.fillText(`EXPRESSION: ${emotion.toUpperCase()} (${confidence.toFixed(0)}%)`, bx + 10, badgeY + 28);

    // Threat Tag Right Badge
    const tagText = statusText || "TRACKED";
    ctx.font = "bold 9px 'JetBrains Mono', monospace";
    const tagMetrics = ctx.measureText(tagText);
    const tagX = bx + badgeWidth - tagMetrics.width - 10;

    ctx.fillStyle = color;
    ctx.fillText(tagText, tagX, badgeY + 14);

    ctx.restore();
  }

  drawLandmarks(landmarks, cw, ch) {
    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = "var(--accent-cyan)";
    ctx.shadowColor = "rgba(0, 210, 255, 0.8)";
    ctx.shadowBlur = 4;

    landmarks.forEach(([lx, ly]) => {
      ctx.beginPath();
      ctx.arc(lx, ly, 2.5, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  takeSnapshot() {
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = this.canvasEl.width;
    exportCanvas.height = this.canvasEl.height;
    const expCtx = exportCanvas.getContext("2d");

    // Draw video (mirrored)
    expCtx.save();
    expCtx.translate(exportCanvas.width, 0);
    expCtx.scale(-1, 1);
    expCtx.drawImage(this.videoEl, 0, 0, exportCanvas.width, exportCanvas.height);
    expCtx.restore();

    // Draw tactical HUD canvas
    expCtx.drawImage(this.canvasEl, 0, 0);

    // Watermark
    expCtx.fillStyle = "rgba(0, 255, 136, 0.8)";
    expCtx.font = "12px 'JetBrains Mono', monospace";
    expCtx.fillText(`SIH 26187 COMMAND RECORD: ${new Date().toISOString()}`, 20, exportCanvas.height - 20);

    const link = document.createElement("a");
    link.download = `CCTV_SURVEILLANCE_SNAP_${Date.now()}.png`;
    link.href = exportCanvas.toDataURL("image/png");
    link.click();
    this.addAlertItem("OPERATOR", "Tactical frame snapshot archived to local disk.", false);
  }

  exportAlertLog() {
    if (this.activeAlerts.length === 0) {
      alert("No surveillance alerts logged yet.");
      return;
    }

    let csvContent = "data:text/csv;charset=utf-8,Timestamp,Source,ThreatLevel,EventMessage\n";
    this.activeAlerts.forEach((a) => {
      csvContent += `"${a.timestamp}","${a.source}","${a.isThreat ? 'HIGH' : 'NORMAL'}","${a.message.replace(/"/g, '""')}"\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `SURVEILLANCE_INTELLIGENCE_LOG_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

// Initialize on DOM load
window.addEventListener("DOMContentLoaded", () => {
  window.commandCenter = new SurveillanceCommandCenter();
});
