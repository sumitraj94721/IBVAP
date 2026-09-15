/**
 * IBVAP - Intelligent Border Video Analytics Platform (SIH 26187)
 * Frontend Dashboard Engine: Cameras, Canvas Overlays, RBAC Auth, Profile HUD & Audit System
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

    // Header Officer Badges
    this.headerOfficerName = document.getElementById("header-officer-name");
    this.headerOfficerBadge = document.getElementById("header-officer-badge");
    this.headerClearanceBadge = document.getElementById("header-clearance-badge");
    this.headerIndicatorDot = document.getElementById("header-indicator-dot");

    // Officer Profile HUD Elements (Requirement 5)
    this.officerHudCard = document.getElementById("officer-hud-card");
    this.hudOfficerName = document.getElementById("hud-officer-name");
    this.hudOfficerRank = document.getElementById("hud-officer-rank");
    this.hudOfficerId = document.getElementById("hud-officer-id");
    this.hudOfficerClearance = document.getElementById("hud-officer-clearance");
    this.hudOfficerSector = document.getElementById("hud-officer-sector");
    this.hudSessionTimer = document.getElementById("hud-session-timer");
    this.hudAvatarSymbol = document.getElementById("hud-avatar-symbol");
    this.hudAvatarBox = document.getElementById("hud-avatar-box");
    this.btnOpenAuditDrawer = document.getElementById("btn-open-audit-drawer");
    this.btnOpenFenceModal = document.getElementById("btn-open-fence-modal");
    this.btnLogout = document.getElementById("btn-logout");

    // Countermeasures Elements
    this.cmGateStatus = document.getElementById("cm-gate-status");
    this.cmSirenStatus = document.getElementById("cm-siren-status");
    this.gate02HudBanner = document.getElementById("gate02-hud-banner");
    this.cam4GateStatusText = document.getElementById("cam4-gate-status-text");
    this.incidentsListEl = document.getElementById("incidents-list");

    // Modals & Overlays
    this.loginModal = document.getElementById("login-modal");
    this.loginErrorMsg = document.getElementById("login-error-msg");
    this.escalationModal = document.getElementById("escalation-modal");
    this.fenceModal = document.getElementById("fence-modal");
    this.auditDrawerOverlay = document.getElementById("audit-drawer-overlay");
    this.auditLogsTbody = document.getElementById("audit-logs-tbody");
    this.auditSearchInput = document.getElementById("audit-search-input");
    this.auditLogCount = document.getElementById("audit-log-count");

    // Audio synthesizer for sirens and pings
    this.audioCtx = null;
    this.sirenInterval = null;

    // State
    this.currentStream = null;
    this.currentDeviceId = null;
    this.websocket = null;
    this.isWsConnected = false;
    this.fpsCounters = { cam1: 0, cam2: 25, cam3: 25, cam4: 25 };
    this.cam1FrameCount = 0;
    this.cam1FpsTimer = performance.now();
    this.demoTripwireActive = false;
    
    // Auth & Session State
    this.currentOfficer = null;
    this.sessionStartTime = null;
    this.sessionTimerInterval = null;
    this.cachedAuditLogs = [];
    this.isGateLocked = false;
    this.isSirenActive = false;
    this.activeEscalationIncident = null;

    this.init();
  }

  async init() {
    this.initClock();
    this.initButtons();
    this.initAuthHandlers();
    this.initAuditDrawerHandlers();
    this.initFenceModalHandlers();
    this.initEscalationHandlers();
    
    // Check initial authentication
    await this.checkAuthStatus();
    
    // Initialize Camera and Grid
    await this.initWebcam();
    await this.enumerateCameras();
    this.initWebSocket();
    this.startOverlayRenderLoop();
    this.fetchIncidentsLog();
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

      document.querySelectorAll(".panel-live-ts").forEach((el) => {
        el.textContent = `${h}:${m}:${s}.${ms.slice(0, 2)}`;
      });
    };
    setInterval(update, 40);
    update();
  }

  /* -----------------------------------------------------------
     2. Authentication & Session Verification (Requirements 1, 2, 5, 6)
     ----------------------------------------------------------- */
  async checkAuthStatus() {
    try {
      const res = await fetch("/auth/me");
      if (res.ok) {
        const data = await res.json();
        this.renderOfficerProfile(data.officer);
      } else {
        this.promptLogin();
      }
    } catch (err) {
      console.warn("Auth check fallback:", err);
      this.promptLogin();
    }
  }

  renderOfficerProfile(officer) {
    this.currentOfficer = officer;
    if (this.loginModal) this.loginModal.style.display = "none";

    const isLevel4 = officer.clearance_level >= 4;
    const isLevel2 = officer.clearance_level === 2;

    // Header Pill
    if (this.headerOfficerName) {
      const badgeTag = officer.badge || (officer.user_id === "operator1" ? "BSF-8841" : officer.user_id);
      this.headerOfficerName.textContent = `OFFICER: ${officer.full_name} [${badgeTag}]`;
    }
    if (this.headerClearanceBadge) {
      this.headerClearanceBadge.textContent = `LVL ${officer.clearance_level}`;
      this.headerClearanceBadge.style.color = isLevel4 ? "var(--gold-commander)" : "var(--cyan-glow)";
    }
    if (this.headerOfficerBadge) {
      if (isLevel4) {
        this.headerOfficerBadge.classList.add("level-4-pill");
      } else {
        this.headerOfficerBadge.classList.remove("level-4-pill");
      }
    }

    // Officer Profile HUD Card
    if (this.hudOfficerName) this.hudOfficerName.textContent = officer.full_name;
    if (this.hudOfficerRank) this.hudOfficerRank.textContent = officer.rank.toUpperCase();
    if (this.hudOfficerId) this.hudOfficerId.textContent = officer.user_id;
    if (this.hudOfficerSector) this.hudOfficerSector.textContent = officer.assigned_sector;

    if (this.hudOfficerClearance) {
      this.hudOfficerClearance.textContent = `CLEARANCE LEVEL ${officer.clearance_level}`;
    }

    // Avatar Insignia
    if (this.hudAvatarSymbol) {
      this.hudAvatarSymbol.textContent = isLevel4 ? "🎖️" : "🛡️";
    }

    // Color Coding (Requirement 5)
    // Level 4 Commander → Gold, Level 2 Operator → Cyan
    if (this.officerHudCard) {
      if (isLevel4) {
        this.officerHudCard.className = "sidebar-card officer-hud-card theme-level-4";
      } else {
        this.officerHudCard.className = "sidebar-card officer-hud-card theme-level-2";
      }
    }

    // Role-Based UI Gatekeeping (Requirement 3)
    // Level 4 Commander gets Audit Drawer & Virtual Fence Buttons
    if (this.btnOpenAuditDrawer) {
      this.btnOpenAuditDrawer.style.display = isLevel4 ? "block" : "none";
    }
    if (this.btnOpenFenceModal) {
      this.btnOpenFenceModal.style.display = isLevel4 ? "block" : "none";
    }

    // Start Session Timer (Requirement 6)
    this.startSessionTimer(officer.login_time);

    // Refresh video streams now that authenticated cookie is set
    this.refreshVideoStreams();

    this.logAlert("AUTH-GUARD", "SUCCESS", `Access Granted: ${officer.full_name} [${officer.user_id}] authenticated at clearance Level ${officer.clearance_level}.`);
  }

  refreshVideoStreams() {
    // Force reload image streams with new auth cookie
    ["cam2-stream-img", "cam3-stream-img", "cam4-stream-img"].forEach((id) => {
      const img = document.getElementById(id);
      if (img) {
        const baseSrc = img.src.split("?")[0];
        img.src = `${baseSrc}?t=${Date.now()}`;
      }
    });
  }

  promptLogin() {
    this.stopSessionTimer();
    this.currentOfficer = null;
    window.location.href = "/login";
  }

  startSessionTimer(loginTime) {
    this.stopSessionTimer();
    this.sessionStartTime = loginTime ? loginTime * 1000 : Date.now();

    const updateTimer = () => {
      if (!this.sessionStartTime || !this.hudSessionTimer) return;
      const elapsed = Math.max(0, Math.floor((Date.now() - this.sessionStartTime) / 1000));
      const h = String(Math.floor(elapsed / 3600)).padStart(2, "0");
      const m = String(Math.floor((elapsed % 3600) / 60)).padStart(2, "0");
      const s = String(elapsed % 60).padStart(2, "0");
      this.hudSessionTimer.textContent = `${h}:${m}:${s}`;
    };

    this.sessionTimerInterval = setInterval(updateTimer, 1000);
    updateTimer();
  }

  stopSessionTimer() {
    if (this.sessionTimerInterval) {
      clearInterval(this.sessionTimerInterval);
      this.sessionTimerInterval = null;
    }
    if (this.hudSessionTimer) this.hudSessionTimer.textContent = "00:00:00";
    this.sessionStartTime = null;
  }

  initAuthHandlers() {
    const usernameInput = document.getElementById("login-username");
    const passwordInput = document.getElementById("login-password");
    const rememberCheckbox = document.getElementById("login-remember");

    // Login Form Submit
    const loginForm = document.getElementById("login-form");
    if (loginForm) {
      loginForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const user_id = usernameInput.value.trim();
        const password = passwordInput.value;
        const remember_me = rememberCheckbox ? rememberCheckbox.checked : false;

        if (this.loginErrorMsg) this.loginErrorMsg.style.display = "none";

        try {
          const res = await fetch("/auth/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id, password, remember_me })
          });

          if (res.ok) {
            const data = await res.json();
            this.renderOfficerProfile(data.officer);
            this.fetchIncidentsLog();
          } else {
            const errData = await res.json().catch(() => ({}));
            if (this.loginErrorMsg) {
              this.loginErrorMsg.textContent = errData.detail || "AUTHENTICATION FAILED — INVALID CREDENTIALS";
              this.loginErrorMsg.style.display = "block";
            }
          }
        } catch (err) {
          if (this.loginErrorMsg) {
            this.loginErrorMsg.textContent = `Terminal Error: ${err.message}`;
            this.loginErrorMsg.style.display = "block";
          }
        }
      });
    }

    // Logout
    if (this.btnLogout) {
      this.btnLogout.addEventListener("click", async () => {
        try {
          await fetch("/auth/logout", { method: "POST" });
        } catch (e) {}
        this.stopSessionTimer();
        window.location.href = "/login";
      });
    }
  }

  /* -----------------------------------------------------------
     3. Frontend Reusable Event Emitter (Requirement 11)
     ----------------------------------------------------------- */
  async auditAction(action, target, details = "") {
    try {
      await fetch("/api/audit/emit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, target, details })
      });
    } catch (err) {
      console.warn("UI Audit emit error:", err);
    }
  }

  /* -----------------------------------------------------------
     4. Officer Audit Log Drawer (Requirement 9: Level 4 Only)
     ----------------------------------------------------------- */
  initAuditDrawerHandlers() {
    const btnOpen = this.btnOpenAuditDrawer;
    const btnClose = document.getElementById("btn-close-audit-drawer");
    const btnRefresh = document.getElementById("btn-refresh-audit-logs");

    if (btnOpen) {
      btnOpen.addEventListener("click", async () => {
        if (!this.currentOfficer || this.currentOfficer.clearance_level < 4) {
          alert("Access Denied: Level 4 High Command Clearance Required.");
          return;
        }
        await this.loadAuditLogs();
        if (this.auditDrawerOverlay) this.auditDrawerOverlay.style.display = "flex";
      });
    }

    if (btnClose) {
      btnClose.addEventListener("click", () => {
        if (this.auditDrawerOverlay) this.auditDrawerOverlay.style.display = "none";
      });
    }

    if (this.auditDrawerOverlay) {
      this.auditDrawerOverlay.addEventListener("click", (e) => {
        if (e.target === this.auditDrawerOverlay) {
          this.auditDrawerOverlay.style.display = "none";
        }
      });
    }

    if (btnRefresh) {
      btnRefresh.addEventListener("click", () => this.loadAuditLogs());
    }

    if (this.auditSearchInput) {
      this.auditSearchInput.addEventListener("input", (e) => {
        const query = e.target.value.toLowerCase().trim();
        this.filterAuditLogs(query);
      });
    }
  }

  async loadAuditLogs() {
    if (!this.auditLogsTbody) return;
    try {
      const res = await fetch("/auth/audit-logs");
      if (res.status === 403) {
        alert("HTTP 403 Forbidden: Level 4 High Command Clearance Required.");
        return;
      }
      const data = await res.json();
      if (data.status === "SUCCESS") {
        this.cachedAuditLogs = data.logs || [];
        this.renderAuditLogsTable(this.cachedAuditLogs);
        if (this.auditLogCount) {
          this.auditLogCount.textContent = `${this.cachedAuditLogs.length} events recorded`;
        }
      }
    } catch (err) {
      console.warn("Could not load audit logs:", err);
    }
  }

  renderAuditLogsTable(logs) {
    if (!this.auditLogsTbody) return;
    this.auditLogsTbody.innerHTML = "";

    if (logs.length === 0) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<td colspan="7" style="text-align: center; color: var(--text-dim); padding: 20px;">No audit events recorded.</td>`;
      this.auditLogsTbody.appendChild(tr);
      return;
    }

    logs.forEach((log) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td style="color: var(--text-dim); font-size: 10px;">${log.timestamp}</td>
        <td style="color: var(--gold-commander); font-weight: 700;">${log.user_id}</td>
        <td><strong>${log.full_name}</strong></td>
        <td style="color: var(--text-muted); font-size: 10px;">${log.rank}</td>
        <td><span class="action-badge action-${log.action}">${log.action}</span></td>
        <td style="color: var(--cyan-glow); font-weight: 600;">${log.target}</td>
        <td style="color: var(--text-main); font-size: 10px;">${log.details || "-"}</td>
      `;
      this.auditLogsTbody.appendChild(tr);
    });
  }

  filterAuditLogs(query) {
    if (!query) {
      this.renderAuditLogsTable(this.cachedAuditLogs);
      return;
    }
    const filtered = this.cachedAuditLogs.filter((log) => {
      return (
        log.user_id.toLowerCase().includes(query) ||
        log.full_name.toLowerCase().includes(query) ||
        log.action.toLowerCase().includes(query) ||
        log.target.toLowerCase().includes(query) ||
        (log.details && log.details.toLowerCase().includes(query))
      );
    });
    this.renderAuditLogsTable(filtered);
  }

  /* -----------------------------------------------------------
     5. Virtual Fence Configuration (Requirement 3 & 7: Level 4 Only)
     ----------------------------------------------------------- */
  initFenceModalHandlers() {
    const btnOpen = this.btnOpenFenceModal;
    const btnClose = document.getElementById("btn-close-fence-modal");
    const btnCancel = document.getElementById("btn-cancel-fence");
    const btnSave = document.getElementById("btn-save-fence");

    if (btnOpen) {
      btnOpen.addEventListener("click", () => {
        if (!this.currentOfficer || this.currentOfficer.clearance_level < 4) {
          alert("Access Denied: Level 4 High Command Clearance Required.");
          return;
        }
        if (this.fenceModal) this.fenceModal.style.display = "flex";
      });
    }

    if (btnClose) btnClose.addEventListener("click", () => { if (this.fenceModal) this.fenceModal.style.display = "none"; });
    if (btnCancel) btnCancel.addEventListener("click", () => { if (this.fenceModal) this.fenceModal.style.display = "none"; });

    if (btnSave) {
      btnSave.addEventListener("click", async () => {
        const camSelect = document.getElementById("fence-camera-select");
        const zoneInput = document.getElementById("fence-zone-name");
        const modeRadio = document.querySelector('input[name="fence_mode"]:checked');

        const cameraId = camSelect ? camSelect.value : "CAM-01";
        const zoneName = zoneInput ? zoneInput.value : "RESTRICTED_BUFFER";
        const mode = modeRadio ? modeRadio.value : "HIGH_SENSITIVITY";

        try {
          const res = await fetch("/api/fence/modify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              camera_id: cameraId,
              zone_name: zoneName,
              coordinates: [[0.15, 0.25], [0.85, 0.25], [0.9, 0.88], [0.1, 0.88]],
              status: mode
            })
          });

          if (res.ok) {
            const data = await res.json();
            this.logAlert("FENCE-CFG", "SUCCESS", `Virtual Fence reconfigured on ${cameraId} by ${this.currentOfficer.full_name} (${this.currentOfficer.user_id}).`);
            if (this.fenceModal) this.fenceModal.style.display = "none";
          } else {
            const err = await res.json().catch(() => ({}));
            alert(err.detail || "Virtual fence modification denied.");
          }
        } catch (err) {
          console.error("Fence modify error:", err);
        }
      });
    }
  }

  /* -----------------------------------------------------------
     6. Threat Escalation & Incident First Responder (Requirements 7, 8, 10)
     ----------------------------------------------------------- */
  initEscalationHandlers() {
    const btnCloseEsc = document.getElementById("btn-close-escalation");
    const btnCancelEsc = document.getElementById("btn-cancel-escalation");
    const btnConfirmEsc = document.getElementById("btn-confirm-escalation");

    if (btnCloseEsc) btnCloseEsc.addEventListener("click", () => this.closeEscalationModal());
    if (btnCancelEsc) btnCancelEsc.addEventListener("click", () => this.closeEscalationModal());

    if (btnConfirmEsc) {
      btnConfirmEsc.addEventListener("click", async () => {
        const qrtSelect = document.getElementById("esc-qrt-select");
        const chkSiren = document.getElementById("chk-siren");
        const chkGate = document.getElementById("chk-gate-lockdown");

        const qrtUnit = qrtSelect ? qrtSelect.value : "QRT Unit 1";
        const soundSiren = chkSiren ? chkSiren.checked : false;
        const lockdownGate = chkGate ? chkGate.checked : false;

        const incidentId = this.activeEscalationIncident ? this.activeEscalationIncident.id : `ALERT-${Math.floor(1000 + Math.random() * 9000)}`;
        const source = this.activeEscalationIncident ? this.activeEscalationIncident.source : "CAM-01";
        const details = this.activeEscalationIncident ? this.activeEscalationIncident.desc : "Perimeter Intrusion";

        try {
          const res = await fetch("/api/qrt/dispatch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              incident_id: incidentId,
              threat_source: source,
              threat_details: details,
              qrt_unit: qrtUnit,
              sound_siren: soundSiren,
              lockdown_gate: lockdownGate
            })
          });

          if (res.ok) {
            const data = await res.json();
            
            if (soundSiren) this.startPerimeterSiren(6000);
            if (lockdownGate) this.deployGateLockdown(true);

            // Log confirmed escalation with First Responder ID
            this.logAlert(
              "QRT-DISPATCH",
              "ALERT",
              `🚀 ${data.message} [First Responder: ${data.first_responder_id}] // ${data.signature_hash}`
            );

            this.closeEscalationModal();
            this.fetchIncidentsLog();
          }
        } catch (err) {
          console.error("Escalation error:", err);
          this.closeEscalationModal();
        }
      });
    }

    // Defensive Countermeasures Quick Toggles
    const btnQuickGate = document.getElementById("btn-quick-toggle-gate");
    if (btnQuickGate) {
      btnQuickGate.addEventListener("click", () => {
        this.deployGateLockdown(!this.isGateLocked);
      });
    }

    const btnQuickSiren = document.getElementById("btn-quick-toggle-siren");
    if (btnQuickSiren) {
      btnQuickSiren.addEventListener("click", () => {
        if (this.isSirenActive) {
          this.stopPerimeterSiren();
        } else {
          this.startPerimeterSiren(5000);
        }
      });
    }

    // Refresh Incident Logs
    const btnRefreshInc = document.getElementById("btn-refresh-incidents");
    if (btnRefreshInc) {
      btnRefreshInc.addEventListener("click", () => this.fetchIncidentsLog());
    }
  }

  openEscalationModal(incident) {
    this.activeEscalationIncident = incident;

    const elId = document.getElementById("esc-incident-id");
    const elSource = document.getElementById("esc-threat-source");
    const elDesc = document.getElementById("esc-threat-desc");
    const elResponder = document.getElementById("esc-first-responder");

    if (elId) elId.textContent = incident.id;
    if (elSource) elSource.textContent = incident.source;
    if (elDesc) elDesc.textContent = incident.desc;

    // Attach current authenticated officer as First Responder (Requirement 10)
    if (elResponder && this.currentOfficer) {
      elResponder.textContent = `${this.currentOfficer.user_id} (${this.currentOfficer.full_name})`;
    }

    if (this.escalationModal) this.escalationModal.style.display = "flex";
  }

  closeEscalationModal() {
    if (this.escalationModal) this.escalationModal.style.display = "none";
    this.activeEscalationIncident = null;
  }

  async acknowledgeAlert(alertId, alertSource) {
    try {
      const res = await fetch("/api/alerts/acknowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ alert_id: alertId, notes: `Acknowledged at console` })
      });

      if (res.ok) {
        const data = await res.json();
        this.logAlert("ACK-RESOLVE", "SUCCESS", `Alert ${alertId} verified by First Responder ${data.first_responder_id} (${data.officer_name}).`);
      }
    } catch (err) {
      console.warn("Acknowledge alert error:", err);
    }
  }

  deployGateLockdown(state) {
    this.isGateLocked = state;
    if (this.gate02HudBanner) {
      this.gate02HudBanner.style.display = state ? "block" : "none";
    }
    if (this.cmGateStatus) {
      this.cmGateStatus.textContent = state ? "LOCKDOWN DEPLOYED" : "OPEN / ARMED";
      this.cmGateStatus.className = state ? "status-pill status-alert" : "status-pill status-secure";
    }
    if (this.cam4GateStatusText) {
      this.cam4GateStatusText.textContent = state ? "GATE 02 LOCKED" : "GATE ARMED";
      this.cam4GateStatusText.style.color = state ? "var(--alert-red)" : "var(--status-green)";
    }
    const officerId = this.currentOfficer ? this.currentOfficer.user_id : "OPERATOR";
    this.auditAction("TOGGLE_GATE_LOCKDOWN", "GATE-02", state ? "Lockdown deployed" : "Barrier raised");
    this.logAlert("GATE-02", state ? "ALERT" : "INFO", state ? "Hydraulic barrier gate 02 dropped. Access denied." : "Gate 02 barrier raised. Standard inspection armed.");
  }

  startPerimeterSiren(durationMs = 5000) {
    this.isSirenActive = true;
    if (this.cmSirenStatus) {
      this.cmSirenStatus.textContent = "SIREN ACTIVE";
      this.cmSirenStatus.className = "status-pill status-alert";
    }

    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!this.audioCtx) this.audioCtx = new AudioContext();
      if (this.audioCtx.state === "suspended") this.audioCtx.resume();

      let highTone = true;
      this.sirenInterval = setInterval(() => {
        if (!this.isSirenActive) return;
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(highTone ? 920 : 640, this.audioCtx.currentTime);
        gain.gain.setValueAtTime(0.18, this.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.audioCtx.currentTime + 0.28);
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start();
        osc.stop(this.audioCtx.currentTime + 0.28);
        highTone = !highTone;
      }, 320);

      setTimeout(() => this.stopPerimeterSiren(), durationMs);
    } catch (e) {
      console.warn("Siren Audio Error:", e);
    }
  }

  stopPerimeterSiren() {
    this.isSirenActive = false;
    if (this.sirenInterval) {
      clearInterval(this.sirenInterval);
      this.sirenInterval = null;
    }
    if (this.cmSirenStatus) {
      this.cmSirenStatus.textContent = "STANDBY";
      this.cmSirenStatus.className = "status-pill status-standby";
    }
  }

  async fetchIncidentsLog() {
    if (!this.incidentsListEl) return;
    try {
      const res = await fetch("/api/alerts/incidents");
      const data = await res.json();
      if (data.status === "SUCCESS" && data.incidents && data.incidents.length > 0) {
        this.incidentsListEl.innerHTML = "";
        data.incidents.forEach((inc) => {
          const item = document.createElement("div");
          item.className = "incident-item";
          item.innerHTML = `
            <div class="inc-header-row">
              <span class="inc-id">${inc.incident_id}</span>
              <span class="inc-time">${inc.timestamp.split(" ")[1] || inc.timestamp}</span>
            </div>
            <div class="inc-desc"><strong>${inc.qrt_unit}</strong> → ${inc.threat_source}</div>
            <div class="inc-sig-row">
              <span>RESP: <strong>${inc.first_responder_id || inc.officer_badge}</strong></span>
              <span style="font-weight: 700; color: var(--gold-commander);">${inc.signature_hash}</span>
            </div>
          `;
          this.incidentsListEl.appendChild(item);
        });
      }
    } catch (err) {
      console.warn("Could not fetch incidents:", err);
    }
  }

  /* -----------------------------------------------------------
     7. Camera Ingestion & Device Enumeration for CAM-01
     ----------------------------------------------------------- */
  async enumerateCameras() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
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
          // Audit camera switch event (Requirement 7)
          this.auditAction("SWITCH_CAMERA", "CAM-01", `Device switched to ${e.target.value || "Default"}`);
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
     8. Tactical Overlay Canvas Scaffolding
     ----------------------------------------------------------- */
  startOverlayRenderLoop() {
    const render = (now) => {
      this.cam1FrameCount++;
      if (now - this.cam1FpsTimer >= 1000) {
        this.fpsCounters.cam1 = Math.round((this.cam1FrameCount * 1000) / (now - this.cam1FpsTimer));
        this.cam1FrameCount = 0;
        this.cam1FpsTimer = now;
        const fpsEl = document.getElementById("cam1-fps");
        if (fpsEl) fpsEl.textContent = `${this.fpsCounters.cam1} FPS`;
      }

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

    // AI Analytics Status
    ctx.font = "bold 13px 'JetBrains Mono', monospace";
    ctx.fillStyle = "#00f0ff";
    ctx.fillText("AI ANALYTICS ENGINE: ARMED [PHASE 1 SCAFFOLD]", 24, 34);

    // Virtual Restricted Polygon Zone
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

    // Tripwire Virtual Line
    const tripwireY = h * 0.72;
    ctx.strokeStyle = this.demoTripwireActive ? "#ef4444" : "rgba(245, 158, 11, 0.75)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w * 0.1, tripwireY);
    ctx.lineTo(w * 0.9, tripwireY);
    ctx.stroke();

    ctx.fillStyle = this.demoTripwireActive ? "#ef4444" : "#f59e0b";
    ctx.fillText(
      this.demoTripwireActive ? "TRIPWIRE-01: BREACH DETECTED!" : "TRIPWIRE-01 [VIRTUAL LINE]",
      w * 0.1,
      tripwireY - 6
    );

    ctx.restore();
  }

  /* -----------------------------------------------------------
     9. WebSocket Hub for Real-Time Alerts
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
          
          const alertId = `ALERT-${Math.floor(1000 + Math.random() * 9000)}`;
          const source = data.event ? data.event.source : "CAM-01 [LOCAL]";
          const msg = data.event ? data.event.msg : "Tactical perimeter intrusion simulated.";

          this.logThreatAlertWithActionButtons(alertId, source, msg);

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

  logThreatAlertWithActionButtons(alertId, source, msg) {
    if (!this.alertFeedEl) return;

    const timeStr = new Date().toTimeString().split(" ")[0];
    const entry = document.createElement("div");
    entry.className = "log-entry level-ALERT";
    entry.innerHTML = `
      <span class="log-time">[${timeStr}]</span>
      <span class="log-source">[${source}]</span>
      <span class="log-msg">⚠️ <strong>${alertId}: ${msg}</strong></span>
      <div class="log-entry-actions">
        <button class="btn-ack-trigger" data-id="${alertId}" data-source="${source}">
          ACKNOWLEDGE
        </button>
        <button class="btn-escalate-trigger" data-id="${alertId}" data-source="${source}" data-desc="${msg}">
          🚨 DISPATCH QRT
        </button>
      </div>
    `;

    // Attach Acknowledge listener
    const btnAck = entry.querySelector(".btn-ack-trigger");
    if (btnAck) {
      btnAck.addEventListener("click", () => {
        this.acknowledgeAlert(alertId, source);
        btnAck.disabled = true;
        btnAck.textContent = "ACKNOWLEDGED";
        btnAck.style.opacity = "0.5";
      });
    }

    // Attach QRT Escalation listener
    const btnEsc = entry.querySelector(".btn-escalate-trigger");
    if (btnEsc) {
      btnEsc.addEventListener("click", () => {
        this.openEscalationModal({
          id: alertId,
          source: source,
          desc: msg
        });
      });
    }

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
     10. Panel Maximize & UI Controls
     ----------------------------------------------------------- */
  initButtons() {
    document.querySelectorAll(".btn-maximize").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const panelId = e.currentTarget.dataset.panel;
        const panel = document.getElementById(panelId);
        if (panel) {
          const isMax = panel.classList.toggle("maximized");
          e.currentTarget.textContent = isMax ? "🗗" : "⛶";
          if (panelId === "panel-cam1") {
            setTimeout(() => this.syncCanvasDimensions(), 250);
          }
          // Audit panel maximize UI action
          this.auditAction("VIEW_PANEL", panelId, isMax ? "Panel maximized" : "Panel restored");
        }
      });
    });

    const drillBtn = document.getElementById("btn-trigger-drill");
    if (drillBtn) {
      drillBtn.addEventListener("click", () => {
        if (this.websocket && this.websocket.readyState === WebSocket.OPEN) {
          this.websocket.send(JSON.stringify({ action: "trigger_demo_alert" }));
        } else {
          const alertId = `ALERT-${Math.floor(1000 + Math.random() * 9000)}`;
          const source = "CAM-01 [LOCAL]";
          const msg = "Tactical virtual perimeter tripwire breach simulated.";
          this.logThreatAlertWithActionButtons(alertId, source, msg);
          this.demoTripwireActive = true;
          this.playAlertTone();
          setTimeout(() => (this.demoTripwireActive = false), 3500);
        }
      });
    }

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

// Global instance
window.addEventListener("DOMContentLoaded", () => {
  window.socDashboard = new SOCDashboardManager();
});
