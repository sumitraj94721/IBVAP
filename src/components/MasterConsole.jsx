import React, { useState } from 'react';
import { INITIAL_DOSSIER } from '../types/tacticalTypes';

export const MasterConsole = ({
  onOpenPTZ = () => {},
  onOpenLockout = () => {},
  onTakeSnapshot = () => {},
  onNavigateToScreen = () => {},
  alerts = [],
  onAcknowledgeAlert = () => {},
  onIgnoreAlert = () => {},
  dossier = INITIAL_DOSSIER,
  onToggleSopStep = () => {},
  kpiData = {},
  threatLevel = 'HIGH',
}) => {
  const [viewMode, setViewMode] = useState('2x2');
  const [focusedCam, setFocusedCam] = useState(0);
  const [isFrozen, setIsFrozen] = useState(false);
  const [dispatchStatus, setDispatchStatus] = useState(null);
  const [streamErrors, setStreamErrors] = useState({});

  const handleDispatchQRF = () => {
    setDispatchStatus('QRF-01 Dispatched to Sector Bravo (Grid PK-IND-324)');
    setTimeout(() => setDispatchStatus(null), 4000);
  };

  const handleFocusCam = (camIndex) => {
    setFocusedCam(camIndex);
    setViewMode('1x1');
  };

  const cams = [
    {
      id: 'CAM-01',
      name: 'CAM-01',
      sector: 'SEC-ALPHA (FORWARD OPTICAL)',
      resolution: '1080p@30',
      preset: 'PRESET: P04 (PTZ +12.4°, Z: 1.0x)',
      url: '/video_feed/cam1',
      targetLabel: 'P-023 (PATROL)',
    },
    {
      id: 'CAM-02',
      name: 'CAM-02',
      sector: 'SEC-BRAVO (BORDER TRIPWIRE)',
      resolution: '1080p@30 IR',
      preset: 'DEFCON-3 ESCALATION',
      url: '/video_feed/cam2',
      isAlert: threatLevel === 'CRITICAL' || threatLevel === 'HIGH',
      targetLabel: 'P-019 (RESTRICTED)',
    },
    {
      id: 'CAM-03',
      name: 'CAM-03',
      sector: 'CHECKPOST 01 - ANPR CAM',
      resolution: '4K@30',
      preset: 'GATE SENSOR: ACTIVE',
      url: '/video_feed/cam3',
      targetLabel: 'GATE 01 ENTRY',
    },
    {
      id: 'CAM-04',
      name: 'CAM-04',
      sector: 'TOWER ELEV +45M (WIDE FOV)',
      resolution: '1080p@30',
      preset: 'SWEEP ANGLE: 310° AZ',
      url: '/video_feed/cam4',
      targetLabel: 'RADAR SYNCED',
    },
  ];

  return (
    <div className="flex flex-col w-full text-on-surface select-none pb-6">
      {/* Dispatch notification toast banner */}
      {dispatchStatus && (
        <div className="mb-2 bg-primary-container text-on-primary-container px-3 py-1.5 font-label-code text-label-code font-bold uppercase tracking-wider flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px]">local_police</span>
            <span>{dispatchStatus}</span>
          </div>
          <button onClick={() => setDispatchStatus(null)} className="text-on-primary-container">
            <span className="material-symbols-outlined text-[14px]">close</span>
          </button>
        </div>
      )}

      {/* TOP TELEMETRY & SENSOR KPI STRIP */}
      <section className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-space-xs mb-space-sm">
        {/* Cam Status */}
        <div className="bg-surface-container-low p-space-sm flex flex-col justify-between shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between font-label-micro text-label-micro text-on-surface-variant">
            <span>CAM ARRAYS</span>
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
          </div>
          <div className="my-0.5">
            <span className="font-telemetry-data text-telemetry-data text-primary">04 / 04</span>
            <span className="font-label-micro text-label-micro text-on-surface-variant block">100% ONLINE</span>
          </div>
          <div className="font-label-micro text-label-micro text-outline tracking-tight truncate">
            FASTAPI RTSP/CCTV
          </div>
        </div>

        {/* Persons Tracked */}
        <div
          onClick={() => onNavigateToScreen('analytics')}
          className="bg-surface-container-low p-space-sm flex flex-col justify-between shadow-sm relative overflow-hidden cursor-pointer hover:bg-surface-container transition-colors"
        >
          <div className="flex items-center justify-between font-label-micro text-label-micro text-on-surface-variant">
            <span>PERS TRACKED</span>
            <span className="text-secondary font-label-code text-label-code">REAL</span>
          </div>
          <div className="my-0.5">
            <span className="font-telemetry-data text-telemetry-data text-secondary-fixed">
              {kpiData.persons ?? 0} ACTIVE
            </span>
            <span className="font-label-micro text-label-micro text-on-surface-variant block">OPTICAL YOLO</span>
          </div>
          <div className="font-label-micro text-label-micro text-outline tracking-tight truncate">
            YOLOv8 + BYTETRACK
          </div>
        </div>

        {/* Vehicles */}
        <div
          onClick={() => onNavigateToScreen('anpr')}
          className="bg-surface-container-low p-space-sm flex flex-col justify-between shadow-sm relative overflow-hidden cursor-pointer hover:bg-surface-container transition-colors"
        >
          <div className="flex items-center justify-between font-label-micro text-label-micro text-on-surface-variant">
            <span>VEHICLES</span>
            <span className="text-primary font-label-code text-label-code">SEC</span>
          </div>
          <div className="my-0.5">
            <span className="font-telemetry-data text-telemetry-data text-on-surface">
              {kpiData.vehicles ?? 0} VERIF
            </span>
            <span className="font-label-micro text-label-micro text-on-surface-variant block">GATE &amp; PERIMETER</span>
          </div>
          <div className="font-label-micro text-label-micro text-outline tracking-tight truncate">
            CLASS ID: NOMINAL
          </div>
        </div>

        {/* ANPR OCR */}
        <div
          onClick={() => onNavigateToScreen('anpr')}
          className="bg-surface-container-low p-space-sm flex flex-col justify-between shadow-sm relative overflow-hidden cursor-pointer hover:bg-surface-container transition-colors"
        >
          <div className="flex items-center justify-between font-label-micro text-label-micro text-on-surface-variant">
            <span>ANPR OCR</span>
            <span className="text-tertiary font-label-code text-label-code font-bold">
              {kpiData.anprEvents ?? 0} LOGS
            </span>
          </div>
          <div className="my-0.5">
            <span className="font-telemetry-data text-telemetry-data text-tertiary">
              {kpiData.anprEvents > 0 ? `${kpiData.anprEvents} LOGGED` : 'STANDBY'}
            </span>
            <span className="font-label-micro text-label-micro text-on-surface-variant block">OCR ACTIVE</span>
          </div>
          <div className="font-label-micro text-label-micro text-outline tracking-tight truncate">
            FASTAPI /api/anpr
          </div>
        </div>

        {/* Active Alerts */}
        <div
          onClick={() => onNavigateToScreen('alerts')}
          className="bg-error-container/20 p-space-sm flex flex-col justify-between shadow-sm relative overflow-hidden cursor-pointer hover:bg-error-container/30 transition-colors"
        >
          <div className="flex items-center justify-between font-label-micro text-label-micro text-error">
            <span>ACTIVE ALERTS</span>
            <span className="inline-block w-2 h-2 bg-error rounded-full animate-ping" />
          </div>
          <div className="my-0.5">
            <span className="font-telemetry-data text-telemetry-data text-error font-bold">
              {alerts.filter((a) => a.status === 'ACTIVE' || !a.acknowledged).length} ALERTS
            </span>
            <span className="font-label-micro text-label-micro text-error/80 block">
              DEFCON THREAT {threatLevel}
            </span>
          </div>
          <div className="font-label-micro text-label-micro text-error/70 tracking-tight truncate">
            TRIPWIRE &amp; PERIMETER
          </div>
        </div>

        {/* Intrusions */}
        <div
          onClick={() => onNavigateToScreen('twin')}
          className="bg-surface-container-low p-space-sm flex flex-col justify-between shadow-sm relative overflow-hidden cursor-pointer hover:bg-surface-container transition-colors"
        >
          <div className="flex items-center justify-between font-label-micro text-label-micro text-on-surface-variant">
            <span>INTRUSIONS</span>
            <span className="text-tertiary font-label-micro text-label-micro uppercase">L-2</span>
          </div>
          <div className="my-0.5">
            <span className="font-telemetry-data text-telemetry-data text-tertiary">
              {kpiData.intrusions ?? 0} ACTIVE
            </span>
            <span className="font-label-micro text-label-micro text-on-surface-variant block">SECTOR BRAVO</span>
          </div>
          <div className="font-label-micro text-label-micro text-outline tracking-tight truncate">
            VIRTUAL FENCE TRIPWIRE
          </div>
        </div>

        {/* Inference Engine */}
        <div
          onClick={() => onNavigateToScreen('analytics')}
          className="bg-surface-container-low p-space-sm flex flex-col justify-between shadow-sm relative overflow-hidden cursor-pointer hover:bg-surface-container transition-colors"
        >
          <div className="flex items-center justify-between font-label-micro text-label-micro text-on-surface-variant">
            <span>AI PIPELINE</span>
            <span className="text-primary font-label-code text-label-code">OK</span>
          </div>
          <div className="my-0.5">
            <span className="font-telemetry-data text-telemetry-data text-primary">
              {kpiData.latencyMs ? `${kpiData.latencyMs}ms` : '12ms'}
            </span>
            <span className="font-label-micro text-label-micro text-on-surface-variant block">LATENCY</span>
          </div>
          <div className="font-label-micro text-label-micro text-outline tracking-tight truncate">
            REAL-TIME INFERENCE
          </div>
        </div>

        {/* Archive Status */}
        <div
          onClick={() => onNavigateToScreen('history')}
          className="bg-surface-container-low p-space-sm flex flex-col justify-between shadow-sm relative overflow-hidden cursor-pointer hover:bg-surface-container transition-colors"
        >
          <div className="flex items-center justify-between font-label-micro text-label-micro text-on-surface-variant">
            <span>AUDIT LOG</span>
            <span className="text-secondary font-label-micro text-label-micro">SYNC</span>
          </div>
          <div className="my-0.5">
            <span className="font-telemetry-data text-telemetry-data text-on-surface">SQLite</span>
            <span className="font-label-micro text-label-micro text-on-surface-variant block">IMMUTABLE</span>
          </div>
          <div className="font-label-micro text-label-micro text-outline tracking-tight truncate">
            SHA-256 SIGNED
          </div>
        </div>
      </section>

      {/* WORKSPACE GRID: 2x2 CCTV MATRIX (LEFT) + TACTICAL DISPATCH & DOSSIER (RIGHT) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-sm items-start">
        {/* LEFT & CENTER: TACTICAL CCTV MATRIX & CONTROL CONSOLE (8 COLS) */}
        <div className="lg:col-span-8 flex flex-col gap-space-sm">
          {/* Surveillance Top Ribbon Controls */}
          <div className="bg-surface-container-low px-space-md py-1.5 flex flex-wrap items-center justify-between shadow-sm">
            <div className="flex items-center gap-space-sm">
              <span className="material-symbols-outlined text-primary text-[18px]">videocam</span>
              <span className="font-headline-md text-headline-md uppercase tracking-wider text-on-surface">
                QUAD MULTI-VIEW (/video_feed)
              </span>
              <span className="px-space-xs py-0.5 bg-surface-container-highest text-primary font-label-micro text-label-micro uppercase">
                AUTHORITATIVE STREAMS
              </span>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setViewMode('1x1')}
                className={`px-2 py-1 font-label-code text-label-code uppercase tracking-wider transition-colors ${
                  viewMode === '1x1'
                    ? 'bg-primary text-on-primary font-bold'
                    : 'bg-surface-container-highest hover:bg-surface-bright text-on-surface'
                }`}
                title="Switch to Single View"
              >
                1x1 Focus
              </button>
              <button
                onClick={() => setViewMode('2x2')}
                className={`px-2 py-1 font-label-code text-label-code uppercase tracking-wider transition-colors ${
                  viewMode === '2x2'
                    ? 'bg-primary text-on-primary font-bold'
                    : 'bg-surface-container-highest hover:bg-surface-bright text-on-surface'
                }`}
                title="Quad Grid Mode"
              >
                2x2 Grid
              </button>
              <button
                onClick={() => setViewMode(viewMode === 'thermal' ? '2x2' : 'thermal')}
                className={`px-2 py-1 font-label-code text-label-code uppercase tracking-wider transition-colors ${
                  viewMode === 'thermal'
                    ? 'bg-secondary text-on-secondary font-bold'
                    : 'bg-surface-container-highest hover:bg-surface-bright text-on-surface'
                }`}
                title="Thermal View Mode"
              >
                Thermal/IR
              </button>
              <button
                onClick={() => onOpenPTZ(cams[focusedCam].name)}
                className="bg-surface-container-highest hover:bg-surface-bright text-on-surface px-2 py-1 font-label-code text-label-code uppercase tracking-wider transition-colors flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[14px]">tune</span>
                <span>PTZ Pad</span>
              </button>
              <button
                onClick={() => onNavigateToScreen('surveillance')}
                className="bg-surface-container-highest hover:bg-surface-bright text-secondary px-2 py-1 font-label-code text-label-code uppercase tracking-wider transition-colors flex items-center gap-1"
                title="Surveillance Hub"
              >
                <span className="material-symbols-outlined text-[14px]">fullscreen</span>
              </button>
            </div>
          </div>

          {/* 2X2 CAMERA TILES CONTAINER OR 1x1 FOCUS */}
          <div
            className={`grid gap-space-xs bg-surface-container-lowest p-space-xs shadow-inner ${
              viewMode === '1x1' ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-2'
            }`}
          >
            {cams.map((cam, idx) => {
              if (viewMode === '1x1' && focusedCam !== idx) return null;
              const hasErr = streamErrors[cam.id];

              return (
                <div
                  key={cam.id}
                  onClick={() => {
                    if (viewMode === '1x1') setFocusedCam((idx + 1) % 4);
                    else setFocusedCam(idx);
                  }}
                  className={`relative bg-surface aspect-video overflow-hidden group select-none shadow-sm cursor-pointer border ${
                    cam.isAlert ? 'border-error ring-1 ring-error' : 'border-outline-variant'
                  } ${viewMode === 'thermal' ? 'filter invert hue-rotate-180 contrast-125' : ''}`}
                >
                  {!hasErr ? (
                    <img
                      className="w-full h-full object-cover"
                      alt={cam.name}
                      src={cam.url}
                      onError={() => setStreamErrors((prev) => ({ ...prev, [cam.id]: true }))}
                    />
                  ) : (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-surface-container-low p-4 text-center">
                      <span className="material-symbols-outlined text-4xl text-outline mb-2">videocam_off</span>
                      <span className="font-label-code text-on-surface font-bold">{cam.name}</span>
                      <span className="font-label-micro text-on-surface-variant">{cam.sector}</span>
                      <span className="font-label-micro text-secondary mt-1">OPTICAL STANDBY ({cam.resolution})</span>
                    </div>
                  )}

                  {/* Corner Tactical Accents */}
                  <div className="absolute top-1 left-1 w-2.5 h-2.5 border-t border-l border-primary/60 pointer-events-none" />
                  <div className="absolute top-1 right-1 w-2.5 h-2.5 border-t border-r border-primary/60 pointer-events-none" />
                  <div className="absolute bottom-1 left-1 w-2.5 h-2.5 border-b border-l border-primary/60 pointer-events-none" />
                  <div className="absolute bottom-1 right-1 w-2.5 h-2.5 border-b border-r border-primary/60 pointer-events-none" />

                  {/* Camera Header HUD */}
                  <div className="absolute top-1.5 left-2 right-2 flex items-center justify-between font-label-micro text-label-micro pointer-events-none">
                    <div className="flex items-center gap-1.5 bg-surface-container-lowest/90 px-1.5 py-0.5">
                      <span className={`w-2 h-2 rounded-full ${cam.isAlert ? 'bg-error animate-ping' : 'bg-primary'}`} />
                      <span className="text-on-surface font-bold">{cam.name}</span>
                      <span className="text-on-surface-variant">|</span>
                      <span className="text-on-surface-variant">{cam.sector}</span>
                    </div>
                    <div className="bg-surface-container-lowest/90 px-1.5 py-0.5 text-on-surface-variant font-mono">
                      {cam.preset}
                    </div>
                  </div>

                  {/* Crosshairs Reticle Center */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-40">
                    <div className="relative w-8 h-8 flex items-center justify-center">
                      <div className="absolute w-full h-[1px] bg-primary" />
                      <div className="absolute h-full w-[1px] bg-primary" />
                      <div className="w-3 h-3 rounded-full border border-primary/60" />
                    </div>
                  </div>

                  {/* Bottom Telemetry HUD */}
                  <div className="absolute bottom-1.5 left-2 right-2 flex items-center justify-between font-label-micro text-label-micro pointer-events-none">
                    <div className="bg-surface-container-lowest/90 px-1 py-0.5 text-on-surface-variant font-mono">
                      LAT: {kpiData.latencyMs ? `${kpiData.latencyMs}ms` : '12ms'} | {cam.url}
                    </div>
                    <div className="bg-primary/20 text-primary px-1 py-0.5 font-mono">
                      {cam.targetLabel}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Under Feeds Actions Bar */}
          <div className="bg-surface-container-low p-2 flex items-center justify-between font-label-code text-label-code border border-outline-variant">
            <div className="flex items-center gap-2">
              <span className="text-outline uppercase text-label-micro">COMMAND OVERVIEW:</span>
              <span className="text-primary font-bold">DEFENSE GRID ACTIVE</span>
              <span className="text-outline-variant">|</span>
              <span className="text-secondary font-mono">DEFCON {threatLevel}</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => onOpenPTZ(cams[focusedCam].name)}
                className="bg-secondary text-on-secondary px-3 py-1 uppercase font-bold text-label-code hover:brightness-110"
              >
                PTZ Slew Pad
              </button>
              <button
                onClick={onTakeSnapshot}
                className="bg-surface-container-highest hover:bg-surface-bright text-on-surface px-3 py-1 uppercase text-label-code"
              >
                Snapshot Quad
              </button>
              <button
                onClick={onOpenLockout}
                className="bg-error text-on-error px-3 py-1 uppercase font-bold text-label-code hover:bg-error/90 flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[14px]">emergency</span>
                <span>Lockout / QRF</span>
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT PANE (4 COLS): INCIDENT DOSSIER & ACTIVE ALERTS */}
        <div className="lg:col-span-4 flex flex-col gap-space-sm">
          {/* INCIDENT DOSSIER CARD */}
          <div className="bg-surface-container-low p-space-sm border border-outline-variant shadow-md">
            <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-outline-variant">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-error text-[18px]">security</span>
                <span className="font-headline-md text-headline-md text-on-surface font-bold text-[14px] uppercase">
                  ACTIVE INCIDENT DOSSIER
                </span>
              </div>
              <span className="bg-error text-on-error px-1.5 py-0.5 font-label-micro text-label-micro font-bold uppercase">
                {threatLevel} THREAT
              </span>
            </div>

            <div className="bg-surface-container p-2 mb-2 font-label-code text-label-code space-y-1">
              <div className="flex justify-between">
                <span className="text-outline text-label-micro">INCIDENT ID</span>
                <span className="text-error font-bold font-mono">{dossier.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-outline text-label-micro">CLASSIFICATION</span>
                <span className="text-on-surface font-bold">{dossier.classification} ({dossier.confidence})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-outline text-label-micro">TARGET / BEARING</span>
                <span className="text-secondary font-mono">{dossier.targetId} • {dossier.bearing}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-outline text-label-micro">SECTOR COORD</span>
                <span className="text-primary font-mono text-[10px]">{dossier.coordinates}</span>
              </div>
            </div>

            {/* SOP Steps Checklist */}
            <div className="space-y-1 mb-3">
              <span className="font-label-micro text-label-micro text-outline uppercase block">
                STANDARD OPERATING PROCEDURE (SOP)
              </span>
              {dossier.sopSteps.map((step, idx) => (
                <div
                  key={step.title}
                  onClick={() => onToggleSopStep(idx)}
                  className="flex items-center justify-between bg-surface-container px-2 py-1.5 cursor-pointer hover:bg-surface-container-high transition-colors"
                >
                  <div className="flex items-center gap-1.5 font-label-code text-label-code text-[11px]">
                    <span className={`material-symbols-outlined text-[15px] ${step.completed ? 'text-primary' : 'text-outline'}`}>
                      {step.completed ? 'check_circle' : 'radio_button_unchecked'}
                    </span>
                    <span className={step.completed ? 'line-through text-outline' : 'text-on-surface'}>
                      {step.title}
                    </span>
                  </div>
                  <span className={`font-label-micro text-[10px] font-bold font-mono ${step.completed ? 'text-primary' : 'text-error'}`}>
                    {step.status}
                  </span>
                </div>
              ))}
            </div>

            {/* QRF Action Buttons */}
            <div className="flex items-center gap-2 pt-1 border-t border-outline-variant">
              <button
                onClick={handleDispatchQRF}
                className="flex-1 bg-primary text-on-primary font-label-code text-label-code font-bold py-1.5 uppercase hover:bg-primary-fixed-dim shadow"
              >
                Dispatch QRF-01
              </button>
              <button
                onClick={onOpenLockout}
                className="bg-error text-on-error font-label-code text-label-code font-bold py-1.5 px-3 uppercase hover:bg-error/90"
              >
                Lockout
              </button>
            </div>
          </div>

          {/* ACTIVE SECURITY ALERTS PANEL */}
          <div className="bg-surface-container-low p-space-sm border border-outline-variant shadow-md flex-1">
            <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-outline-variant">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-warning-amber text-[18px]">warning</span>
                <span className="font-headline-md text-headline-md text-on-surface font-bold text-[14px] uppercase">
                  ACTIVE ALERTS ({alerts.length})
                </span>
              </div>
              <button
                onClick={() => onNavigateToScreen('alerts')}
                className="text-primary font-label-micro text-label-micro hover:underline uppercase"
              >
                VIEW ALL
              </button>
            </div>

            <div className="space-y-1.5 max-h-[320px] overflow-y-auto pr-0.5">
              {alerts.length === 0 ? (
                <div className="p-4 text-center text-outline font-label-code text-label-code">
                  NO ACTIVE SECURITY ALERTS
                </div>
              ) : (
                alerts.slice(0, 5).map((a) => (
                  <div
                    key={a.id}
                    className={`p-2 bg-surface-container border transition-colors ${
                      a.severity === 'CRITICAL' || a.type === 'critical'
                        ? 'border-error/40 bg-error-container/10'
                        : 'border-outline-variant'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-label-code text-label-code font-bold text-on-surface">
                        {a.title}
                      </span>
                      <span className="text-outline font-label-micro font-mono">
                        {a.timestamp || a.time}
                      </span>
                    </div>
                    <div className="flex items-center justify-between font-label-micro text-label-micro text-on-surface-variant font-mono">
                      <span>{a.sector || a.cam} • {a.targetId || a.target || 'TARGET'}</span>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => onAcknowledgeAlert(a.id)}
                          className="text-primary hover:underline uppercase"
                        >
                          ACK
                        </button>
                        <span className="text-outline-variant">|</span>
                        <button
                          onClick={() => onIgnoreAlert(a.id)}
                          className="text-outline hover:text-on-surface uppercase"
                        >
                          DISMISS
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MasterConsole;
