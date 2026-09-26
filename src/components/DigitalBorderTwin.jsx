import React, { useState, useEffect } from 'react';
import { BORDER_TWIN_PIP_IMG, SOC_TELEMETRY_STREAM } from '../types/tacticalTypes';

export const DigitalBorderTwin = ({
  onOpenPTZ = () => {},
  onOpenLockout = () => {},
  onNavigateToScreen = () => {},
  alerts = [],
  aiTelemetry = null,
}) => {
  const [activeView, setActiveView] = useState('eo');
  const [selectedSector, setSelectedSector] = useState('BRAVO');
  const [activeLayer, setActiveLayer] = useState('none');
  const [geofenceOn, setGeofenceOn] = useState(true);
  const [notification, setNotification] = useState(null);
  const [realEvents, setRealEvents] = useState([]);
  const [fusionSummary, setFusionSummary] = useState(null);

  // Fetch real security events & multi-camera bunker incident fusion from backend
  useEffect(() => {
    let isMounted = true;
    const fetchSecurityEvents = async () => {
      try {
        const [evRes, fusRes] = await Promise.all([
          fetch('/api/events?limit=30'),
          fetch('/api/incidents/fusion'),
        ]);
        if (evRes.ok) {
          const data = await evRes.json();
          if (isMounted && data.events && data.events.length > 0) {
            const mapped = data.events.map((e) => ({
              time: e.timestamp ? e.timestamp.slice(11, 19) : new Date().toLocaleTimeString(),
              cam: e.camera_id || 'CAM-03',
              type: e.severity === 'CRITICAL' ? 'CRIT' : 'INFO',
              badgeClass: e.severity === 'CRITICAL' ? 'bg-error-container text-on-error-container' : 'bg-surface-container-highest text-primary',
              title: e.title || 'SECURITY EVENT',
              details: e.details || `TRACK ID: ${e.track_id || 'UNKNOWN'}`,
              isReal: true,
            }));
            setRealEvents(mapped);
          }
        }
        if (fusRes.ok) {
          const fusData = await fusRes.json();
          if (isMounted) setFusionSummary(fusData);
        }
      } catch (err) {
        // Backend offline or error
      }
    };

    fetchSecurityEvents();
    const interval = setInterval(fetchSecurityEvents, 5000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const showNotification = (msg) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3500);
  };

  const displayStream = realEvents.length > 0 ? realEvents : SOC_TELEMETRY_STREAM;
  const activeFusion = fusionSummary || aiTelemetry?.fusion || null;
  const activeInc = activeFusion?.fused_incidents?.[0] || null;
  const protectedAssets = activeFusion?.protected_assets || [
    { name: 'OUTPOST ALPHA', camera_id: 'CAM-03', zone_name: 'BUNKER / OUTPOST ALPHA', status: 'ALERT' },
    { name: 'CHECKPOINT DELTA', camera_id: 'CAM-04', zone_name: 'RESTRICTED APPROACH / INTRUSION AREA', status: 'WATCH' },
    { name: 'FORWARD GATE ALPHA', camera_id: 'CAM-01', zone_name: 'BORDER ZONE A', status: 'SECURE' },
  ];

  const handleExportCSV = () => {
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      ['Timestamp,Camera,Severity,Event,Target,Grid']
        .concat(
          displayStream.map(
            (e) => `${e.time},${e.cam},${e.type},"${e.title}","${e.details}",PK-IND-324`
          )
        )
        .join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `SOC_INCIDENT_STREAM_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showNotification('SOC Audit Dossier (.CSV) successfully exported.');
  };

  return (
    <div className="flex flex-col w-full text-on-surface select-none pb-6">
      {/* Toast Alert */}
      {notification && (
        <div className="mb-2 bg-primary-container text-on-primary-container px-3 py-1 font-label-code text-label-code font-bold uppercase tracking-wider flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px]">campaign</span>
            <span>{notification}</span>
          </div>
          <button onClick={() => setNotification(null)}>
            <span className="material-symbols-outlined text-[14px]">close</span>
          </button>
        </div>
      )}

      {/* TOP CONTEXT HUD & TACTICAL CRUMB BAR */}
      <div className="flex flex-wrap items-center justify-between gap-space-sm bg-surface-container-low p-space-md mb-space-sm shadow-md">
        <div className="flex items-center gap-space-md">
          <div className="flex items-center gap-space-xs bg-surface-container-highest px-space-sm py-1">
            <span className="material-symbols-outlined text-secondary text-[18px]">public</span>
            <span className="font-headline-md text-headline-md tracking-wider text-on-surface">
              DIGITAL BORDER TWIN
            </span>
          </div>
          <div className="flex items-center gap-1 font-label-code text-label-code flex-wrap">
            <span className="text-on-surface-variant">INCIDENT LINK:</span>
            <span className="text-secondary font-bold">CAM-03 → BUNKER / OUTPOST ALPHA → {activeInc?.status || 'ACTIVE INCIDENT'}</span>
            <span className="text-outline-variant px-1">/</span>
            <span className="text-error bg-error-container/20 px-1 font-mono uppercase font-bold">
              {activeInc ? `${activeInc.event_type || 'PROTECTED-AREA INTRUSION'} [DEMO / SIMULATION]` : (alerts.length > 0 ? `BREACH ACTIVE [${alerts[0]?.id || 'P-019'}]` : 'GRID NORMAL')}
            </span>
          </div>
        </div>

        {/* TIER SELECTOR & RESOLUTION CONTROLS */}
        <div className="flex items-center gap-space-sm">
          <div className="flex bg-surface-container-lowest p-0.5">
            <button
              onClick={() => setActiveView('ground')}
              className={`px-space-sm py-1 font-label-code text-label-code transition-colors ${
                activeView === 'ground'
                  ? 'bg-surface-container-high text-secondary font-bold'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              GROUND
            </button>
            <button
              onClick={() => setActiveView('eo')}
              className={`px-space-sm py-1 font-label-code text-label-code transition-colors ${
                activeView === 'eo'
                  ? 'bg-surface-container-high text-secondary font-bold'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              OVERHEAD / EO
            </button>
            <button
              onClick={() => setActiveView('cam')}
              className={`px-space-sm py-1 font-label-code text-label-code transition-colors ${
                activeView === 'cam'
                  ? 'bg-surface-container-high text-secondary font-bold'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              CAM MATRIX
            </button>
            <button
              onClick={() => setActiveView('sector')}
              className={`px-space-sm py-1 font-label-code text-label-code transition-colors ${
                activeView === 'sector'
                  ? 'bg-surface-container-high text-secondary font-bold'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              SECTOR GRID
            </button>
          </div>

          <div className="bg-surface-container-highest px-space-sm py-1 font-label-micro text-label-micro text-tertiary">
            DIGITAL TWIN TELEMETRY
          </div>
        </div>
      </div>

      {/* PROTECTED ASSETS & BUNKER CORRELATION STRIP (Section 15) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-space-xs mb-space-sm">
        {protectedAssets.map((asset, i) => {
          const isAlert = asset.status === 'ALERT' || asset.status === 'CRITICAL';
          return (
            <div
              key={i}
              onClick={() => onNavigateToScreen('dashboard')}
              className={`p-space-sm border cursor-pointer flex items-center justify-between ${
                isAlert
                  ? 'bg-error-container/20 border-error'
                  : 'bg-surface-container-low border-outline-variant'
              }`}
            >
              <div>
                <div className="font-label-code text-label-code font-bold text-on-surface">
                  {i + 1}. {asset.name} — <span className="text-secondary">{asset.camera_id}</span>
                </div>
                <div className="font-label-micro text-label-micro text-on-surface-variant">
                  {asset.camera_id} → {asset.zone_name} → {isAlert ? 'ACTIVE INCIDENT' : asset.status}
                </div>
              </div>
              <span
                className={`px-2 py-0.5 font-label-micro text-label-micro font-bold uppercase ${
                  isAlert ? 'bg-error text-on-error' : 'bg-surface-container-highest text-primary'
                }`}
              >
                {asset.status}
              </span>
            </div>
          );
        })}
      </div>

      {/* MAIN DUAL-PANEL BORDER TWIN CANVAS */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-space-sm">
        {/* LEFT & CENTER: STRATEGIC VECTOR MAP ENGINE (8 COLS) */}
        <div className="xl:col-span-8 flex flex-col gap-space-sm">
          {/* MAP VIEWPORT CONTAINER */}
          <div className="relative bg-surface-container-lowest overflow-hidden min-h-[580px] flex flex-col justify-between shadow-xl">
            {/* MAP OVERLAY CONTROLS / TOOLBAR */}
            <div className="absolute top-space-sm left-space-sm right-space-sm z-30 flex items-center justify-between pointer-events-none">
              <div className="pointer-events-auto flex items-center gap-space-xs bg-surface-container-low/90 backdrop-blur px-space-sm py-1">
                <span className="material-symbols-outlined text-primary text-[16px]">radar</span>
                <span className="font-label-code text-label-code text-primary font-bold">
                  RADAR SWEEP: 360° CONTRAST ACTIVE
                </span>
                <span className="text-outline-variant">|</span>
                <span className="font-label-micro text-label-micro text-on-surface-variant">
                  RANGE: 12.4 KM
                </span>
                <span className="text-outline-variant">|</span>
                <span className="font-label-micro text-label-micro text-secondary font-mono">
                  BEARING: 328° NW
                </span>
              </div>

              <div className="pointer-events-auto flex items-center gap-1 bg-surface-container-low/90 backdrop-blur px-space-xs py-1">
                <button
                  onClick={() => setActiveLayer(activeLayer === 'thermal' ? 'none' : 'thermal')}
                  className={`px-space-xs py-0.5 font-label-micro text-label-micro transition-colors ${
                    activeLayer === 'thermal'
                      ? 'bg-secondary text-on-secondary font-bold'
                      : 'bg-surface-container-highest text-secondary hover:bg-secondary hover:text-on-secondary'
                  }`}
                  title="Thermal Heatmap Layer [SIMULATION]"
                >
                  THERMAL [SIM]
                </button>
                <button
                  onClick={() => setActiveLayer(activeLayer === 'elevation' ? 'none' : 'elevation')}
                  className={`px-space-xs py-0.5 font-label-micro text-label-micro transition-colors ${
                    activeLayer === 'elevation'
                      ? 'bg-primary text-on-primary font-bold'
                      : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
                  }`}
                  title="Topographic Elevation [SIMULATION]"
                >
                  ELEVATION [SIM]
                </button>
                <button
                  onClick={() => setActiveLayer(activeLayer === 'rf' ? 'none' : 'rf')}
                  className={`px-space-xs py-0.5 font-label-micro text-label-micro transition-colors ${
                    activeLayer === 'rf'
                      ? 'bg-tertiary text-on-tertiary font-bold'
                      : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
                  }`}
                  title="RF Mesh Topology [SIMULATION]"
                >
                  RF-MESH [SIM]
                </button>
                <button
                  onClick={() => setGeofenceOn(!geofenceOn)}
                  className={`px-space-xs py-0.5 font-label-micro text-label-micro font-bold transition-colors ${
                    geofenceOn
                      ? 'bg-error-container text-on-error-container'
                      : 'bg-surface-container text-outline'
                  }`}
                  title="Toggle Perimeter Zones"
                >
                  GEOFENCE: {geofenceOn ? 'ON' : 'OFF'}
                </button>
              </div>
            </div>

            {/* VECTOR STRATEGIC CANVAS */}
            <div className="relative w-full h-[580px] bg-[#070b0e] overflow-hidden flex items-center justify-center">
              {/* MILITARY GRIDLINES */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-20">
                <defs>
                  <pattern id="tactical-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                    <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#4cd7f6" strokeWidth="0.5" />
                    <circle cx="40" cy="40" r="1" fill="#4cd7f6" />
                  </pattern>
                  <pattern
                    id="hatch-alert"
                    width="10"
                    height="10"
                    patternTransform="rotate(45 0 0)"
                    patternUnits="userSpaceOnUse"
                  >
                    <line x1="0" y1="0" x2="0" y2="10" stroke="#ffb4ab" strokeWidth="1.5" opacity="0.3" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#tactical-grid)" />
              </svg>

              {/* RADAR SWEEP LINE ANIMATION */}
              <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                <div
                  className="w-[520px] h-[520px] rounded-full opacity-30 relative"
                  style={{
                    background:
                      'radial-gradient(circle, rgba(75,226,119,0.08) 0%, rgba(15,20,24,0) 70%)',
                  }}
                >
                  <div className="absolute inset-0 rounded-full border border-primary/20" />
                  <div className="absolute inset-16 rounded-full border border-secondary/20" />
                  <div className="absolute inset-32 rounded-full border border-outline-variant/30" />
                  <div
                    className="w-full h-full animate-[spin_6s_linear_infinite]"
                    style={{ transformOrigin: '50% 50%' }}
                  >
                    <div className="w-1/2 h-0.5 bg-gradient-to-r from-transparent to-primary" />
                  </div>
                </div>
              </div>

              {/* PRIMARY VECTOR MAP TOPOLOGY */}
              <svg
                className="relative z-10 w-full h-full"
                viewBox="0 0 900 580"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
              >
                {/* COORDINATE RETICLE MARKS */}
                <g opacity="0.4" stroke="#869585" strokeWidth="0.8">
                  <line x1="450" y1="20" x2="450" y2="560" strokeDasharray="4 6" />
                  <line x1="40" y1="290" x2="860" y2="290" strokeDasharray="4 6" />
                  <circle cx="450" cy="290" r="180" fill="none" />
                  <circle cx="450" cy="290" r="280" fill="none" />
                </g>

                {/* SECTOR DELTA (SIR CREEK / MARITIME) */}
                <path
                  d="M 80 430 Q 140 460 210 520 L 170 570 L 60 550 Z"
                  fill="#1b2024"
                  opacity={selectedSector === 'DELTA' ? '0.8' : '0.4'}
                  className="cursor-pointer hover:opacity-75 transition-opacity"
                  onClick={() => setSelectedSector('DELTA')}
                />
                <text className="font-label-micro text-[9px] tracking-widest" fill="#bccbb9" x="100" y="490">
                  SEC DELTA (SIR CREEK)
                </text>

                {/* SECTOR CHARLIE (THAR DESERT / BARMER) */}
                <path
                  d="M 120 330 Q 220 360 290 440 L 210 510 L 90 410 Z"
                  fill="#1b2024"
                  opacity={selectedSector === 'CHARLIE' ? '0.8' : '0.5'}
                  className="cursor-pointer hover:opacity-75 transition-opacity"
                  onClick={() => setSelectedSector('CHARLIE')}
                />
                <text className="font-label-micro text-[9px] tracking-widest" fill="#bccbb9" x="150" y="380">
                  SEC CHARLIE (BARMER DESERT)
                </text>

                {/* SECTOR ALPHA (WESTERN FRONTIER / R.S. PURA) */}
                <path
                  d="M 280 180 L 440 190 L 410 320 L 260 290 Z"
                  fill="#171c20"
                  stroke="#3d4a3d"
                  strokeWidth="1"
                  opacity={selectedSector === 'ALPHA' ? '0.9' : '0.6'}
                  className="cursor-pointer hover:opacity-85 transition-opacity"
                  onClick={() => setSelectedSector('ALPHA')}
                />
                <text
                  className="font-label-micro text-[10px] font-bold tracking-widest"
                  fill="#4cd7f6"
                  x="300"
                  y="240"
                >
                  SEC ALPHA (R.S. PURA)
                </text>
                <circle cx="350" cy="250" r="3" fill="#4be277" />
                <text className="font-label-micro text-[9px]" fill="#dfe3e9" x="360" y="253">
                  BOP-01 (RS-PURA)
                </text>

                {/* SECTOR BRAVO (LINE OF CONTROL / POONCH BUFFER) */}
                <g id="sector-bravo-group" className="cursor-pointer" onClick={() => setSelectedSector('BRAVO')}>
                  {geofenceOn && (
                    <>
                      <polygon
                        points="460,90 680,120 640,310 440,260"
                        fill="url(#hatch-alert)"
                        stroke="#ffb4ab"
                        strokeWidth="1.5"
                      />
                      <polygon
                        points="480,110 660,135 625,290 460,245"
                        fill="#93000a"
                        opacity="0.12"
                      />
                    </>
                  )}

                  <text
                    className="font-headline-md text-[13px] font-bold tracking-wider"
                    fill="#ffb4ab"
                    x="490"
                    y="145"
                  >
                    SECTOR BRAVO: LOC POONCH BUFFER
                  </text>
                  <text className="font-label-micro text-[9px]" fill="#ffb4ab" x="490" y="160">
                    STATUS: LEVEL 1 THREAT • BREACH VERIFIED
                  </text>

                  {/* VIRTUAL FENCE LINES */}
                  <path
                    d="M 470 120 L 650 145"
                    stroke="#4be277"
                    strokeWidth="2"
                    strokeDasharray="5 3"
                  />
                  <path
                    d="M 460 170 L 635 195"
                    stroke="#ffba61"
                    strokeWidth="1.5"
                    strokeDasharray="3 3"
                  />
                  <path d="M 450 215 L 620 240" stroke="#ffb4ab" strokeWidth="3" />
                  <circle cx="535" cy="227" r="14" fill="#93000a" opacity="0.4" className="animate-ping" />
                  <circle cx="535" cy="227" r="5" fill="#ffb4ab" />
                  <text className="font-label-code text-[11px] font-bold" fill="#ffb4ab" x="548" y="224">
                    BREACH POINT (PK-IND-324)
                  </text>

                  {/* INTRUDER TRACK TRAJECTORY */}
                  <path
                    d="M 580 180 Q 560 205 535 227 Q 520 245 505 260"
                    fill="none"
                    stroke="#ffb4ab"
                    strokeWidth="2"
                    strokeDasharray="2 3"
                  />
                  <circle cx="505" cy="260" r="4" fill="#ffb4ab" />
                  <text
                    className="font-label-micro text-[10px] font-bold"
                    fill="#ffb4ab"
                    x="515"
                    y="264"
                  >
                    P-019 [2.1 m/s - 148° SE]
                  </text>

                  {/* SURVEILLANCE CAMERA COVERAGE CONE */}
                  <circle cx="490" cy="285" r="5" fill="#4cd7f6" />
                  <path
                    d="M 490 285 L 450 200 A 90 90 0 0 1 565 210 Z"
                    fill="#03b5d3"
                    opacity="0.25"
                    stroke="#4cd7f6"
                    strokeWidth="0.8"
                  />
                  <text className="font-label-code text-[10px] font-bold" fill="#4cd7f6" x="445" y="300">
                    CAM-03 (BUNKER / OUTPOST ALPHA)
                  </text>

                  {/* BUNKER / OUTPOST ALPHA PROTECTED STRUCTURE */}
                  <rect
                    x="475"
                    y="330"
                    width="14"
                    height="14"
                    fill="#262b2f"
                    stroke="#ffb4ab"
                    strokeWidth="1.5"
                  />
                  <text className="font-label-code text-[11px] font-bold" fill="#ffb4ab" x="495" y="341">
                    OUTPOST ALPHA (BUNKER ZONE — CAM-03)
                  </text>
                  <circle cx="482" cy="337" r="2" fill="#ffb4ab" />
                </g>

                {/* NORTH COMPASS EMBLEM */}
                <g transform="translate(840, 60)">
                  <circle cx="0" cy="0" r="22" fill="#171c20" stroke="#3d4a3d" strokeWidth="1" />
                  <polygon points="0,-18 5,0 0,-4 -5,0" fill="#4be277" />
                  <polygon points="0,18 5,0 0,4 -5,0" fill="#869585" />
                  <text className="font-label-code text-[11px] font-bold" fill="#4be277" x="-4" y="-22">
                    N
                  </text>
                </g>
              </svg>

              {/* MINI FLOATING HUD: CAM-03 BUNKER / OUTPOST ALPHA PIP STREAM */}
              <div className="absolute bottom-space-sm right-space-sm w-72 bg-surface-container-low shadow-xl p-space-xs z-30">
                <div className="flex items-center justify-between bg-surface-container-highest px-space-xs py-0.5 mb-1">
                  <div className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-error animate-pulse" />
                    <span className="font-label-micro text-label-micro text-error font-bold">
                      CAM-03 BUNKER / OUTPOST ALPHA [DEMO]
                    </span>
                  </div>
                  <span className="font-label-micro text-label-micro text-on-surface-variant font-mono">
                    24 FPS
                  </span>
                </div>

                <div className="relative w-full h-36 bg-surface-container-lowest overflow-hidden flex items-center justify-center">
                  <img
                    className="w-full h-full object-cover opacity-90"
                    alt="CAM-03 Bunker Outpost Demo PIP"
                    src={activeFusion?.snapshots?.[0]?.snapshot_url || '/demo/incidents/cam03_event_intrusion.jpg'}
                  />

                  {/* OVERLAY DETECTION BOUNDING BOX */}
                  <div className="absolute inset-0 pointer-events-none p-4 flex items-center justify-center">
                    <div className="relative w-20 h-28 border border-error bg-error-container/10">
                      <div className="absolute -top-4 -left-1 bg-surface-container-lowest px-1 font-label-micro text-label-micro text-error font-bold whitespace-nowrap">
                        PERSON #{activeInc?.track_id || 'P-001'} [{activeInc?.confidence || '92.8'}%]
                      </div>
                      <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-error" />
                      <div className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-error" />
                      <div className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-error" />
                      <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-error" />
                    </div>
                  </div>

                  <div className="absolute bottom-1 left-1 bg-surface-container-lowest/80 px-1 font-label-micro text-label-micro text-secondary font-mono">
                    FOV: OPTICAL+FLIR
                  </div>
                  <div className="absolute top-1 right-1 bg-error-container text-on-error-container px-1 font-label-micro text-label-micro font-bold uppercase">
                    TRIPWIRE ACTIVE
                  </div>
                </div>

                <div className="flex items-center justify-between mt-1 px-1 font-label-micro text-label-micro text-on-surface-variant">
                  <span>AZ: 148.2° | ELEV: -12.4°</span>
                  <button
                    onClick={() => onOpenPTZ('CAM-04')}
                    className="text-primary hover:underline font-bold"
                  >
                    LOCK CONFIRMED (SLEW)
                  </button>
                </div>
              </div>
            </div>

            {/* STRATEGIC QUICK-SWITCHER FOOTER OF MAP */}
            <div className="bg-surface-container-low p-space-xs flex flex-wrap items-center justify-between text-on-surface-variant gap-space-sm">
              <div className="flex items-center gap-space-sm">
                <span className="font-label-micro text-label-micro text-outline uppercase font-bold">
                  SECTOR SELECT:
                </span>
                {['ALPHA', 'BRAVO', 'CHARLIE', 'DELTA'].map((sec) => (
                  <button
                    key={sec}
                    onClick={() => setSelectedSector(sec)}
                    className={`px-space-xs py-0.5 font-label-code text-label-code transition-colors ${
                      selectedSector === sec
                        ? sec === 'BRAVO'
                          ? 'bg-error-container text-on-error-container font-bold'
                          : 'bg-surface-container-highest text-primary font-bold'
                        : 'bg-surface-container text-on-surface hover:bg-surface-container-high'
                    }`}
                  >
                    SEC-{sec}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-space-xs font-label-code text-label-code">
                <span className="text-outline text-label-micro">REAL-TIME TELEMETRY:</span>
                <span className="text-primary font-bold font-mono">
                  {alerts.length > 0 ? `${alerts.length} ALERTS FLAGGED` : 'NOMINAL PATROL'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT PANE: 4 COLS - REAL-TIME AUDIT STREAM */}
        <div className="xl:col-span-4 flex flex-col gap-space-sm">
          <div className="bg-surface-container-low p-space-sm border border-outline-variant shadow-md flex flex-col h-full">
            <div className="flex items-center justify-between pb-1.5 mb-2 border-b border-outline-variant">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-secondary text-[18px]">history</span>
                <span className="font-headline-md text-headline-md text-on-surface font-bold text-[14px] uppercase">
                  SOC REAL-TIME AUDIT STREAM
                </span>
              </div>
              <button
                onClick={handleExportCSV}
                className="bg-surface-container-highest hover:bg-surface-bright text-on-surface px-2 py-0.5 font-label-micro text-label-micro uppercase"
              >
                Export CSV
              </button>
            </div>

            <div className="space-y-1.5 overflow-y-auto max-h-[500px] flex-1 pr-0.5">
              {displayStream.map((item, idx) => (
                <div
                  key={idx}
                  className="bg-surface-container p-2 border border-outline-variant flex flex-col space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-label-code text-label-code font-bold text-on-surface">
                      {item.title}
                    </span>
                    <span className={`px-1 py-0.2 font-label-micro text-[10px] font-bold uppercase ${item.badgeClass}`}>
                      {item.type}
                    </span>
                  </div>
                  <div className="text-label-micro text-on-surface-variant font-mono">
                    {item.details}
                  </div>
                  <div className="flex items-center justify-between text-outline font-label-micro font-mono">
                    <span>NODE: {item.cam}</span>
                    <span>{item.time}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 pt-2 border-t border-outline-variant flex items-center justify-between">
              <button
                onClick={() => onNavigateToScreen('history')}
                className="text-primary font-label-micro text-label-micro hover:underline uppercase"
              >
                VIEW FULL AUDIT TRAIL
              </button>
              <button
                onClick={onOpenLockout}
                className="bg-error text-on-error px-3 py-1 font-label-code text-label-code font-bold uppercase hover:bg-error/90"
              >
                Perimeter Lockout
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DigitalBorderTwin;
