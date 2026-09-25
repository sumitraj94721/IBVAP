import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import KpiRibbon from './components/KpiRibbon';
import Sidebar from './components/Sidebar';
import AdminLogin from './components/AdminLogin';
import LiveSurveillanceGrid from './components/LiveSurveillanceGrid';
import TacticalBorderMap from './components/TacticalBorderMap';
import AlertsPanel from './components/AlertsPanel';
import CameraStatusTable from './components/CameraStatusTable';
import AiAnalyticsView from './components/AiAnalyticsView';
import EventTimeline from './components/EventTimeline';
import SettingsView from './components/SettingsView';
import VehicleANPR from './components/VehicleANPR';
import LiveSurveillance from './components/LiveSurveillance';
import MasterConsole from './components/MasterConsole';
import DigitalBorderTwin from './components/DigitalBorderTwin';
import SecondaryViews from './components/SecondaryViews';
import PTZPadModal from './components/PTZPadModal';
import TacticalLockoutModal from './components/TacticalLockoutModal';
import ConsoleLockOverlay from './components/ConsoleLockOverlay';
import SnapshotModal from './components/SnapshotModal';
import { INITIAL_DOSSIER } from './types/tacticalTypes';

import {
  INITIAL_CAMERAS,
  INITIAL_ALERTS,
  INITIAL_TIMELINE,
  AI_DETECTION_TYPES,
} from './data/mockData';
import { soundManager } from './utils/audio';

export default function App() {
  // Authentication State: check sessionStorage for isAdmin or auth user
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return (
      sessionStorage.getItem('isAdmin') === 'true' ||
      Boolean(sessionStorage.getItem('ibvap_auth_user'))
    );
  });

  // Navigation & View State
  const [currentTab, setCurrentTab] = useState('dashboard');

  // Operational State
  const [cameras, setCameras] = useState(INITIAL_CAMERAS);
  const [alerts, setAlerts] = useState(INITIAL_ALERTS);
  const [timeline, setTimeline] = useState(INITIAL_TIMELINE);
  const [threatLevel, setThreatLevel] = useState('HIGH');
  const [isMuted, setIsMuted] = useState(false);
  const [isSirenActive, setIsSirenActive] = useState(false);

  // Live AI Telemetry (from LiveSurveillanceGrid via WebSocket)
  const [aiTelemetry, setAiTelemetry] = useState(null);
  const lastAiAlertIdsRef = React.useRef(new Set());

  // Dynamic KPI Data derived from live multi-object AI pipeline
  const activePersons = aiTelemetry?.aiStats?.persons_count ?? aiTelemetry?.targets?.length ?? 0;
  const activeVehicles = aiTelemetry?.aiStats?.vehicles_count ?? aiTelemetry?.vehicles?.length ?? 0;
  const activeTracks = aiTelemetry?.aiStats?.active_tracks ?? aiTelemetry?.tracks?.length ?? (activePersons + activeVehicles);
  const faceMatches = aiTelemetry?.aiStats?.face_matches_count ?? aiTelemetry?.face_matches?.length ?? 0;
  const anprEvents = aiTelemetry?.aiStats?.anpr_events_count ?? aiTelemetry?.anpr_events?.length ?? 0;
  const activeIntrusions = (aiTelemetry?.zone_intrusions ?? 0) + alerts.filter((a) => a.severity === 'CRITICAL' && a.status === 'ACTIVE').length;

  const kpiData = {
    totalCameras: cameras.length,
    activeAlerts: alerts.filter((a) => a.status === 'ACTIVE').length,
    intrusions: activeIntrusions,
    persons: activePersons,
    vehicles: activeVehicles,
    activeTracks: activeTracks,
    faceMatches: faceMatches,
    anprEvents: anprEvents,
    latencyMs: aiTelemetry?.latencyMs ?? 0,
    systemStatus: 'DEFENSE GRID ARMED',
  };

  // Recalculate Threat Level based on active alerts
  useEffect(() => {
    const activeCritical = alerts.some((a) => a.severity === 'CRITICAL' && a.status === 'ACTIVE');
    const activeHigh = alerts.some((a) => a.severity === 'HIGH' && a.status === 'ACTIVE');

    if (activeCritical) {
      setThreatLevel('CRITICAL');
    } else if (activeHigh) {
      setThreatLevel('HIGH');
    } else {
      setThreatLevel('MODERATE');
    }
  }, [alerts]);

  // Subtle periodic background pulse to make system feel alive
  useEffect(() => {
    const pulseInterval = setInterval(() => {
      // Small jitter to camera FPS for realistic telemetry
      setCameras((prevCams) =>
        prevCams.map((c) => ({
          ...c,
          fps: Math.min(30, Math.max(22, c.fps + (Math.random() > 0.5 ? 1 : -1))),
        }))
      );
    }, 4000);

    return () => clearInterval(pulseInterval);
  }, []);

  // Route synchronization: ensure unauthenticated access is redirected to /login,
  // and authenticated users visiting /login are redirected to /dashboard (Step 12)
  useEffect(() => {
    const syncRoute = () => {
      const path = window.location.pathname;
      if (!isAuthenticated) {
        if (path !== '/login') {
          window.history.replaceState(null, '', '/login');
        }
      } else {
        if (path === '/login') {
          window.history.replaceState(null, '', '/dashboard');
        }
      }
    };

    syncRoute();
    window.addEventListener('popstate', syncRoute);
    return () => window.removeEventListener('popstate', syncRoute);
  }, [isAuthenticated]);

  // Handler: Receive live AI telemetry from LiveSurveillanceGrid (via WebSocket)
  const handleAiUpdate = (telemetry) => {
    setAiTelemetry(telemetry);

    // Inject new AI alerts into the alerts panel (deduplicate by id)
    if (telemetry.aiAlerts && telemetry.aiAlerts.length > 0) {
      setAlerts((prev) => {
        const existingIds = new Set(prev.map((a) => a.id));
        const newAlerts = telemetry.aiAlerts.filter(
          (a) => !existingIds.has(a.id) && !lastAiAlertIdsRef.current.has(a.id)
        );
        if (newAlerts.length === 0) return prev;
        newAlerts.forEach((a) => lastAiAlertIdsRef.current.add(a.id));
        // Keep only last 50 ids in the ref set to prevent memory leak
        if (lastAiAlertIdsRef.current.size > 50) {
          const arr = Array.from(lastAiAlertIdsRef.current);
          lastAiAlertIdsRef.current = new Set(arr.slice(-40));
        }
        // Prepend new AI alerts, keep total manageable
        return [...newAlerts, ...prev].slice(0, 30);
      });
    }

    // Inject new AI events into the timeline
    if (telemetry.aiEvents && telemetry.aiEvents.length > 0) {
      setTimeline((prev) => {
        const existingIds = new Set(prev.map((e) => e.id));
        const newEvents = telemetry.aiEvents.filter((e) => !existingIds.has(e.id));
        if (newEvents.length === 0) return prev;
        return [...newEvents, ...prev].slice(0, 60);
      });
    }
  };

  // Handler: Login Success (Step 11 & 12)
  const handleLoginSuccess = () => {
    sessionStorage.setItem('isAdmin', 'true');
    setIsAuthenticated(true);
    window.history.pushState(null, '', '/dashboard');
    soundManager.playRadarPing();
  };

  // Handler: Logout (Step 13)
  const handleLogout = async () => {
    try {
      await fetch('/api/logout', { method: 'POST' });
    } catch (e) {
      // Backend offline or error, proceed with local logout
    }
    sessionStorage.removeItem('isAdmin');
    sessionStorage.removeItem('ibvap_auth_user');
    sessionStorage.removeItem('ibvap_token');
    setIsAuthenticated(false);
    window.history.pushState(null, '', '/login');
    soundManager.stopSiren();
    setIsSirenActive(false);
  };

  // Handler: Trigger Intrusion Drill (Key SIH Demonstration Feature)
  const handleTriggerDrill = () => {
    const newId = `ALT-${Math.floor(1000 + Math.random() * 9000)}`;
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    const newDrillAlert = {
      id: newId,
      severity: 'CRITICAL',
      title: 'SIMULATED INTRUSION: Perimeter boundary tripwire triggered',
      sector: 'Sector Bravo',
      camera: 'CAM-02',
      confidence: 98,
      timestamp: timeStr,
      status: 'ACTIVE',
      targetId: 'DRILL_LOC_#99',
      description: 'Hostile intrusion simulation initiated by Command Officer. Automated QRT dispatch requested.',
    };

    const newTimelineEntry = {
      id: `EV-${Date.now()}`,
      time: timeStr,
      type: 'DRILL',
      severity: 'CRITICAL',
      title: 'Perimeter Intrusion Drill Triggered',
      sector: 'Sector Bravo',
      details: 'Command center drill initiated | CAM-02 locked',
    };

    setAlerts((prev) => [newDrillAlert, ...prev]);
    setTimeline((prev) => [newTimelineEntry, ...prev]);
    setThreatLevel('CRITICAL');

    // Sound alert chime
    soundManager.playAlertChime('CRITICAL');

    // Start siren for drill
    soundManager.toggleSiren((active) => setIsSirenActive(active));
  };

  // Handler: Toggle Audio Mute
  const handleToggleMute = () => {
    const muted = soundManager.toggleMute();
    setIsMuted(muted);
  };

  // Handler: Toggle Siren Manually
  const handleToggleSiren = () => {
    soundManager.toggleSiren((active) => setIsSirenActive(active));
  };

  // Handler: Acknowledge Alert
  const handleAcknowledgeAlert = (id) => {
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: 'ACKNOWLEDGED' } : a))
    );
    soundManager.playRadarPing();
  };

  // Handler: Escalate Alert
  const handleEscalateAlert = (id) => {
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: 'QRT DISPATCHED' } : a))
    );
    soundManager.playAlertChime('HIGH');
  };

  // Tactical Modals & Dossier State
  const [isConsoleLocked, setIsConsoleLocked] = useState(false);
  const [ptzModalOpen, setPtzModalOpen] = useState(false);
  const [ptzSelectedCam, setPtzSelectedCam] = useState('CAM-01 (Forward Optical)');
  const [lockoutModalOpen, setLockoutModalOpen] = useState(false);
  const [snapshotModalOpen, setSnapshotModalOpen] = useState(false);
  const [snapshotTimestamp, setSnapshotTimestamp] = useState('');
  const [dossier, setDossier] = useState(INITIAL_DOSSIER);

  const handleOpenPTZ = (camCode) => {
    setPtzSelectedCam(camCode || 'CAM-01 (Forward Optical)');
    setPtzModalOpen(true);
  };

  const handleTakeSnapshot = () => {
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, '0')}:${String(
      now.getMinutes()
    ).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')} IST`;
    setSnapshotTimestamp(time);
    setSnapshotModalOpen(true);
  };

  const handleToggleSopStep = (index) => {
    setDossier((prev) => {
      const nextSteps = [...prev.sopSteps];
      const step = nextSteps[index];
      const willBeComplete = !step.completed;
      nextSteps[index] = {
        ...step,
        completed: willBeComplete,
        status: willBeComplete ? 'DONE' : 'PENDING',
        statusType: willBeComplete ? 'success' : 'error',
      };
      return { ...prev, sopSteps: nextSteps };
    });
  };

  const handleExecuteLockout = () => {
    setThreatLevel('CRITICAL');
    setDossier((prev) => ({
      ...prev,
      sopSteps: prev.sopSteps.map((s) => ({
        ...s,
        completed: true,
        status: 'DONE',
        statusType: 'success',
      })),
    }));
    soundManager.playAlertChime('CRITICAL');
    soundManager.toggleSiren((active) => setIsSirenActive(active));
  };

  // Handler: Reset Demo
  const handleResetDemo = () => {
    setCameras(INITIAL_CAMERAS);
    setAlerts(INITIAL_ALERTS);
    setTimeline(INITIAL_TIMELINE);
    setThreatLevel('HIGH');
    soundManager.stopSiren();
    setIsSirenActive(false);
  };

  // Strict Dashboard Protection: Unauthenticated access renders dedicated Admin Login page
  if (!isAuthenticated) {
    return <AdminLogin onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Main Top Header */}
      <Header
        threatLevel={threatLevel}
        onLogout={handleLogout}
        isSirenActive={isSirenActive}
        onToggleSiren={handleToggleSiren}
        onLockConsole={() => setIsConsoleLocked(true)}
      />

      {/* Top Telemetry KPI Ribbon */}
      <KpiRibbon kpiData={kpiData} />

      {/* Main Workspace Layout */}
      <div className="app-container">
        {/* Navigation Sidebar */}
        <Sidebar
          currentTab={currentTab}
          setCurrentTab={setCurrentTab}
          alertsCount={kpiData.activeAlerts}
          onTriggerDrill={handleTriggerDrill}
          onToggleMute={handleToggleMute}
          isMuted={isMuted}
          onLogout={handleLogout}
        />

        {/* View Switcher */}
        <main className="soc-view-container">
          {currentTab === 'dashboard' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Primary 2x2 CCTV Grid */}
              <LiveSurveillanceGrid
                cameras={cameras}
                alerts={alerts}
                onAiUpdate={handleAiUpdate}
                onOpenPTZ={handleOpenPTZ}
                onTakeSnapshot={handleTakeSnapshot}
              />

              {/* Tactical Border Map */}
              <TacticalBorderMap alerts={alerts} />

              {/* Alerts & Timeline Split */}
              <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14 }}>
                <AlertsPanel
                  alerts={alerts.slice(0, 8)}
                  onAcknowledgeAlert={handleAcknowledgeAlert}
                  onEscalateAlert={handleEscalateAlert}
                />
                <EventTimeline timeline={timeline.slice(0, 8)} />
              </div>
            </div>
          )}

          {currentTab === 'anpr' && (
            <VehicleANPR
              aiTelemetry={aiTelemetry}
              onOpenPTZ={handleOpenPTZ}
              onNavigateToScreen={(tab) => setCurrentTab(tab)}
            />
          )}

          {currentTab === 'master-console' && (
            <MasterConsole
              onOpenPTZ={handleOpenPTZ}
              onOpenLockout={() => setLockoutModalOpen(true)}
              onTakeSnapshot={handleTakeSnapshot}
              onNavigateToScreen={(tab) => setCurrentTab(tab)}
              alerts={alerts}
              onAcknowledgeAlert={handleAcknowledgeAlert}
              onIgnoreAlert={(id) => setAlerts((prev) => prev.filter((a) => a.id !== id))}
              dossier={dossier}
              onToggleSopStep={handleToggleSopStep}
              kpiData={kpiData}
              threatLevel={threatLevel}
            />
          )}

          {currentTab === 'twin' && (
            <DigitalBorderTwin
              onOpenPTZ={handleOpenPTZ}
              onOpenLockout={() => setLockoutModalOpen(true)}
              onNavigateToScreen={(tab) => setCurrentTab(tab)}
              alerts={alerts}
              aiTelemetry={aiTelemetry}
            />
          )}

          {currentTab === 'surveillance' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <LiveSurveillanceGrid
                cameras={cameras}
                alerts={alerts}
                onAiUpdate={handleAiUpdate}
                onOpenPTZ={handleOpenPTZ}
                onTakeSnapshot={handleTakeSnapshot}
              />
              <LiveSurveillance
                onOpenPTZ={handleOpenPTZ}
                onTakeSnapshot={handleTakeSnapshot}
                onNavigateToScreen={(tab) => setCurrentTab(tab)}
              />
              <CameraStatusTable cameras={cameras} />
            </div>
          )}

          {currentTab === 'dossiers' && (
            <SecondaryViews
              currentScreen="incident-dossiers"
              alerts={alerts}
              onAcknowledgeAlert={handleAcknowledgeAlert}
              onIgnoreAlert={(id) => setAlerts((prev) => prev.filter((a) => a.id !== id))}
              dossier={dossier}
              onNavigateToScreen={(tab) => setCurrentTab(tab)}
              onOpenLockout={() => setLockoutModalOpen(true)}
            />
          )}

          {currentTab === 'map' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <TacticalBorderMap alerts={alerts} />
              <CameraStatusTable cameras={cameras} />
            </div>
          )}

          {currentTab === 'alerts' && (
            <AlertsPanel
              alerts={alerts}
              onAcknowledgeAlert={handleAcknowledgeAlert}
              onEscalateAlert={handleEscalateAlert}
            />
          )}

          {currentTab === 'analytics' && (
            <AiAnalyticsView threatLevel={threatLevel} kpiData={kpiData} aiTelemetry={aiTelemetry} />
          )}

          {currentTab === 'cameras' && (
            <CameraStatusTable cameras={cameras} />
          )}

          {currentTab === 'history' && (
            <EventTimeline
              timeline={timeline}
              onClearEvents={() => setTimeline([])}
            />
          )}

          {currentTab === 'settings' && (
            <SettingsView onResetDemo={handleResetDemo} />
          )}
        </main>
      </div>

      {/* Interactive Tactical Modals */}
      <PTZPadModal
        isOpen={ptzModalOpen}
        onClose={() => setPtzModalOpen(false)}
        selectedCam={ptzSelectedCam}
      />

      <TacticalLockoutModal
        isOpen={lockoutModalOpen}
        onClose={() => setLockoutModalOpen(false)}
        onExecute={handleExecuteLockout}
      />

      <ConsoleLockOverlay
        isLocked={isConsoleLocked}
        onUnlock={() => setIsConsoleLocked(false)}
      />

      <SnapshotModal
        isOpen={snapshotModalOpen}
        onClose={() => setSnapshotModalOpen(false)}
        timestamp={snapshotTimestamp}
      />
    </div>
  );
}
