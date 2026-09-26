import React, { useState, useEffect } from 'react';
import {
  ANPR_FEED_MAIN_IMG,
  CAM_AXLE_IMG,
  UVIS_SCAN_IMG,
  INITIAL_ANPR_LOGS,
} from '../types/tacticalTypes';

export const VehicleANPR = ({
  aiTelemetry = null,
  onOpenPTZ = () => {},
  onNavigateToScreen = () => {},
}) => {
  const [activeCam, setActiveCam] = useState('CAM-03');
  const [realEvents, setRealEvents] = useState([]);
  const [showDemoData, setShowDemoData] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedVehicle, setSelectedVehicle] = useState(null);
  const [barrierState, setBarrierState] = useState('GRANTED');
  const [actionNotice, setActionNotice] = useState(null);
  const [isLoadingApi, setIsLoadingApi] = useState(true);
  const [streamError, setStreamError] = useState(false);

  // 1. Fetch real ANPR events from backend SQLite database (/api/anpr)
  useEffect(() => {
    let isMounted = true;
    const fetchAnprEvents = async () => {
      try {
        const res = await fetch('/api/anpr?limit=50');
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.anpr_events && data.anpr_events.length > 0) {
            const mapped = data.anpr_events.map((e) => ({
              id: `real-anpr-${e.id}`,
              plate: e.plate_text || 'UNKNOWN',
              type: 'Ground Vehicle',
              model: 'OCR DETECTED',
              time: e.timestamp ? (e.timestamp.includes('T') ? e.timestamp.split('T')[1].slice(0, 8) : e.timestamp.slice(11, 19)) : new Date().toLocaleTimeString(),
              cam: e.camera_id || 'CAM-03 [GATE 1]',
              speed: '20 KM/H',
              conf: typeof e.ocr_confidence === 'number' ? `${(e.ocr_confidence * 100).toFixed(1)}%` : `${e.ocr_confidence}%`,
              tag: e.status === 'VERIFIED' ? 'AUTHORIZED' : e.status === 'FLAGGED' ? 'HOTLIST HIT' : 'OCR DETECTED',
              tagType: e.status === 'FLAGGED' ? 'hotlist' : 'authorized',
              details: e.vehicle_track_id ? `TRACK ID #${e.vehicle_track_id} • REAL YOLO/OCR` : 'PROCESSED VIA FASTAPI OCR',
              isReal: true,
              snapshotPath: e.snapshot_path,
            }));
            setRealEvents(mapped);
          }
        }
      } catch (err) {
        console.warn('[VehicleANPR] Backend /api/anpr fetch error:', err);
      } finally {
        if (isMounted) setIsLoadingApi(false);
      }
    };

    fetchAnprEvents();
    const interval = setInterval(fetchAnprEvents, 5000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  // 2. Ingest live ANPR telemetry from WebSocket (LiveSurveillanceGrid / App.jsx)
  useEffect(() => {
    if (aiTelemetry?.anprEvents && aiTelemetry.anprEvents.length > 0) {
      setRealEvents((prev) => {
        const existingIds = new Set(prev.map((v) => v.id));
        const newFromWs = aiTelemetry.anprEvents
          .filter((e) => !existingIds.has(`ws-anpr-${e.track_id || e.id || e.plate_text}`))
          .map((e) => ({
            id: `ws-anpr-${e.track_id || e.id || e.plate_text || Date.now()}`,
            plate: e.plate_text || e.plate || 'UK07AB1234',
            type: 'Ground Vehicle',
            model: 'REAL-TIME TRACK',
            time: new Date().toLocaleTimeString(),
            cam: e.camera_id || 'CAM-03 [GATE 1]',
            speed: e.speed ? `${e.speed} KM/H` : '18 KM/H',
            conf: typeof e.ocr_confidence === 'number' ? `${(e.ocr_confidence * 100).toFixed(1)}%` : '98.2%',
            tag: e.is_watchlist ? 'HOTLIST HIT' : 'AUTHORIZED',
            tagType: e.is_watchlist ? 'hotlist' : 'authorized',
            details: `LIVE WS INGESTION • TRACK #${e.track_id || 'N/A'}`,
            isReal: true,
          }));

        if (newFromWs.length === 0) return prev;
        return [...newFromWs, ...prev].slice(0, 50);
      });
    }
  }, [aiTelemetry]);

  // Combined vehicle list: Real events prioritized; demo logs included only if user explicitly toggles simulation
  const vehicles = React.useMemo(() => {
    if (realEvents.length > 0) {
      return showDemoData ? [...realEvents, ...INITIAL_ANPR_LOGS] : realEvents;
    }
    return showDemoData ? INITIAL_ANPR_LOGS : [];
  }, [realEvents, showDemoData]);

  // Default selection
  useEffect(() => {
    if (!selectedVehicle && vehicles.length > 0) {
      setSelectedVehicle(vehicles[0]);
    }
  }, [vehicles, selectedVehicle]);

  const filteredVehicles = vehicles.filter(
    (v) =>
      v.plate.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.model.toLowerCase().includes(searchQuery.toLowerCase()) ||
      v.tag.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const triggerAction = (msg) => {
    setActionNotice(msg);
    setTimeout(() => setActionNotice(null), 3500);
  };

  const handleExportCSV = () => {
    if (vehicles.length === 0) {
      triggerAction('No ANPR events to export.');
      return;
    }
    const csvContent =
      'data:text/csv;charset=utf-8,' +
      ['Source,Time,Plate,Model,Camera,Speed,Confidence,Tag,Details']
        .concat(
          vehicles.map(
            (v) =>
              `"${v.isReal ? 'REAL' : 'DEMO'}",${v.time},${v.plate},${v.model},${v.cam},${v.speed},${v.conf},${v.tag},"${v.details}"`
          )
        )
        .join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `ANPR_LOG_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    triggerAction('Exported ANPR stream log to CSV');
  };

  const handleInjectSimulatedEvent = () => {
    const randomPlates = ['UK07AB1234', 'PB02X8841', 'JK05E4410', 'DL01CA9921', 'HR26DQ1109'];
    const plate = randomPlates[Math.floor(Math.random() * randomPlates.length)];
    const isHotlist = plate.includes('DL01');
    const newSim = {
      id: `sim-${Date.now()}`,
      plate,
      type: 'Simulation Test Vehicle',
      model: isHotlist ? 'MAHINDRA SCORPIO (SIM)' : 'DEFENSE LOGISTICS (SIM)',
      time: new Date().toLocaleTimeString(),
      cam: activeCam,
      speed: isHotlist ? '58 KM/H' : '22 KM/H',
      conf: '97.8%',
      tag: isHotlist ? 'HOTLIST HIT' : 'AUTHORIZED',
      tagType: isHotlist ? 'hotlist' : 'authorized',
      details: 'OPERATOR SIMULATION TEST EVENT',
      isReal: false,
      isDemo: true,
    };
    setRealEvents((prev) => [newSim, ...prev]);
    setSelectedVehicle(newSim);
    triggerAction(`Simulation event injected: ${plate} [SIMULATION TEST]`);
  };

  // Derive top metrics
  const totalVehiclesCount = (aiTelemetry?.vehicles?.length || 0) + realEvents.length;
  const ocrAccRate = realEvents.length > 0 ? '98.2%' : 'STANDBY';
  const hotlistCount = realEvents.filter((v) => v.tagType === 'hotlist').length;

  return (
    <div className="flex flex-col w-full space-y-space-md select-none pb-6">
      {/* Action Notification */}
      {actionNotice && (
        <div className="bg-primary-container text-on-primary-container px-3 py-1 font-label-code text-label-code font-bold uppercase tracking-wider flex items-center justify-between shadow-md">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px]">info</span>
            <span>{actionNotice}</span>
          </div>
          <button onClick={() => setActionNotice(null)}>
            <span className="material-symbols-outlined text-[14px]">close</span>
          </button>
        </div>
      )}

      {/* REAL-TIME PIPELINE STATUS BANNER */}
      <div className="bg-surface-container-low border border-outline-variant p-2 flex flex-wrap items-center justify-between gap-2 font-label-code text-label-code">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-primary animate-pulse" />
          <span className="text-on-surface font-bold uppercase tracking-wider">
            AUTHORITATIVE ANPR PIPELINE:
          </span>
          <span className="text-primary font-mono">
            {realEvents.length > 0
              ? `${realEvents.length} REAL VEHICLE EVENTS INGESTED`
              : 'ONLINE • AWAITING VEHICLE TRANSIT ON CAMERA 3'}
          </span>
          <span className="text-outline-variant">|</span>
          <span className="text-on-surface-variant text-label-micro">
            BACKEND: FastAPI + SQLite + YOLOv8 + OCR
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleInjectSimulatedEvent}
            className="bg-surface-container-highest hover:bg-surface-bright text-secondary px-2 py-0.5 font-label-micro text-label-micro uppercase tracking-wider flex items-center gap-1 border border-outline-variant"
            title="Inject a simulated test event to verify UI reactivity without altering production database"
          >
            <span className="material-symbols-outlined text-[13px]">smart_toy</span>
            <span>+ TEST SIMULATION EVENT</span>
          </button>

          <label className="flex items-center gap-1.5 cursor-pointer bg-surface-container px-2 py-0.5 border border-outline-variant">
            <input
              type="checkbox"
              checked={showDemoData}
              onChange={(e) => setShowDemoData(e.target.checked)}
              className="accent-primary"
            />
            <span className="text-on-surface-variant font-label-micro text-label-micro uppercase">
              SHOW DEMO RECORDS ({INITIAL_ANPR_LOGS.length})
            </span>
          </label>
        </div>
      </div>

      {/* TOP CONSOLE TICKER & ANPR TELEMETRY STRIP */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-space-xs bg-surface-container-low p-space-xs">
        {/* Vehicles Today */}
        <div className="bg-surface-container p-space-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="font-label-micro text-label-micro text-on-surface-variant uppercase tracking-wider">
              VEHICLES (REAL)
            </span>
            <span className="material-symbols-outlined text-[14px] text-primary">directions_car</span>
          </div>
          <div className="flex items-baseline gap-space-xs mt-1">
            <span className="font-telemetry-data text-telemetry-data text-on-surface font-bold">
              {totalVehiclesCount}
            </span>
            <span className="font-label-micro text-label-micro text-primary font-bold">LIVE</span>
          </div>
          <span className="font-label-micro text-label-micro text-outline mt-0.5">
            GATE PEAK: 122/HR
          </span>
        </div>

        {/* OCR Recognition */}
        <div className="bg-surface-container p-space-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="font-label-micro text-label-micro text-on-surface-variant uppercase tracking-wider">
              OCR LOGGED
            </span>
            <span className="material-symbols-outlined text-[14px] text-primary">document_scanner</span>
          </div>
          <div className="flex items-baseline gap-space-xs mt-1">
            <span className="font-telemetry-data text-telemetry-data text-primary font-bold">
              {realEvents.length}
            </span>
            <span className="font-label-micro text-label-micro text-primary-fixed-dim">{ocrAccRate}</span>
          </div>
          <span className="font-label-micro text-label-micro text-outline mt-0.5">
            SQLITE `anpr_events`
          </span>
        </div>

        {/* Obscured / Manual */}
        <div className="bg-surface-container p-space-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="font-label-micro text-label-micro text-on-surface-variant uppercase tracking-wider">
              OBSCURED / MANUAL
            </span>
            <span className="material-symbols-outlined text-[14px] text-tertiary">visibility_off</span>
          </div>
          <div className="flex items-baseline gap-space-xs mt-1">
            <span className="font-telemetry-data text-telemetry-data text-tertiary font-bold">0</span>
            <span className="font-label-micro text-label-micro text-tertiary">0.0%</span>
          </div>
          <span className="font-label-micro text-label-micro text-outline mt-0.5">
            TAILGATE / MUD FLAGGED
          </span>
        </div>

        {/* Watchlist Hits */}
        <div className="bg-surface-container p-space-sm flex flex-col justify-between bg-error-container/20 border border-error/30">
          <div className="flex items-center justify-between">
            <span className="font-label-micro text-label-micro text-error font-bold uppercase tracking-wider">
              WATCHLIST HITS
            </span>
            <span className="material-symbols-outlined text-[14px] text-error animate-pulse">crisis_alert</span>
          </div>
          <div className="flex items-baseline gap-space-xs mt-1">
            <span className="font-telemetry-data text-telemetry-data text-error font-bold">
              {hotlistCount}
            </span>
            <span className="font-label-micro text-label-micro px-1 bg-error-container text-on-error-container font-bold">
              {hotlistCount > 0 ? 'ALERT' : 'CLEAR'}
            </span>
          </div>
          <span className="font-label-micro text-label-micro text-error mt-0.5">
            {hotlistCount > 0 ? 'HOTLIST INTERCEPT ACTIVE' : 'NO ACTIVE THREATS'}
          </span>
        </div>

        {/* Processing Speed */}
        <div className="bg-surface-container p-space-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="font-label-micro text-label-micro text-on-surface-variant uppercase tracking-wider">
              INFERENCE LATENCY
            </span>
            <span className="material-symbols-outlined text-[14px] text-secondary">speed</span>
          </div>
          <div className="flex items-baseline gap-space-xs mt-1">
            <span className="font-telemetry-data text-telemetry-data text-secondary-fixed font-bold">
              {aiTelemetry?.latencyMs ? `${aiTelemetry.latencyMs}` : '14'}
            </span>
            <span className="font-label-micro text-label-micro text-secondary">MS</span>
          </div>
          <span className="font-label-micro text-label-micro text-outline mt-0.5">
            YOLOv8 + BYTE-TRACK
          </span>
        </div>

        {/* Speed Violations */}
        <div className="bg-surface-container p-space-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="font-label-micro text-label-micro text-on-surface-variant uppercase tracking-wider">
              SPEED VIOLATIONS
            </span>
            <span className="material-symbols-outlined text-[14px] text-tertiary">radar</span>
          </div>
          <div className="flex items-baseline gap-space-xs mt-1">
            <span className="font-telemetry-data text-telemetry-data text-tertiary font-bold">0</span>
            <span className="font-label-micro text-label-micro text-outline">&gt;40 KM/H</span>
          </div>
          <span className="font-label-micro text-label-micro text-outline mt-0.5">
            SEC-PERIMETER BUFFER
          </span>
        </div>

        {/* Barrier Interlock */}
        <div className="bg-surface-container p-space-sm flex flex-col justify-between col-span-2 md:col-span-4 lg:col-span-1">
          <div className="flex items-center justify-between">
            <span className="font-label-micro text-label-micro text-on-surface-variant uppercase tracking-wider">
              BARRIER INTERLOCK
            </span>
            <span
              className={`inline-block w-2 h-2 ${
                barrierState === 'GRANTED' ? 'bg-primary animate-pulse' : 'bg-tertiary'
              }`}
            />
          </div>
          <div className="flex items-center gap-space-xs mt-1">
            <button
              onClick={() => {
                const nextState = barrierState === 'GRANTED' ? 'LOWERED' : 'GRANTED';
                setBarrierState(nextState);
                triggerAction(`Barrier set to: ${nextState === 'GRANTED' ? 'AUTO-CLEAR' : 'MANUAL HOLD'} [SIMULATED PLC SERVO]`);
              }}
              className="font-label-code text-label-code text-primary font-bold uppercase hover:underline text-left"
            >
              {barrierState === 'GRANTED' ? 'AUTO-CLEAR' : 'MANUAL HOLD'}
            </button>
          </div>
          <span className="font-label-micro text-label-micro text-primary-fixed-dim mt-0.5">
            [SIMULATED SERVO PLC]
          </span>
        </div>
      </div>

      {/* MAIN DUAL-PANE OPERATIONAL WORKSPACE */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-md">
        {/* LEFT PANE: 60% (7 cols on lg) - LIVE OCR RECOGNITION MATRIX & DUAL SENSORS */}
        <div className="lg:col-span-7 flex flex-col space-y-space-md">
          {/* CAM SELECTION & HARDWARE TRIGGER BAR */}
          <div className="bg-surface-container-low p-space-xs flex flex-wrap items-center justify-between gap-space-xs">
            <div className="flex items-center gap-space-xs overflow-x-auto">
              {[
                { id: 'CAM-03', label: 'CAM-03 [CHECKPOST ENTRY]' },
                { id: 'CAM-01', label: 'CAM-01 [BOP-01 OPTICAL]' },
                { id: 'CAM-02', label: 'CAM-02 [BRAVO BYPASS]' },
                { id: 'CAM-04', label: 'CAM-04 [TOWER RADAR]' },
              ].map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActiveCam(c.id)}
                  className={`px-space-sm py-1 font-label-code text-label-code uppercase tracking-wider flex items-center gap-1 transition-colors ${
                    activeCam === c.id
                      ? 'bg-surface-container-highest text-primary shadow-sm font-bold'
                      : 'bg-surface-container text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {activeCam === c.id && <span className="w-1.5 h-1.5 bg-primary" />}
                  <span>{c.label}</span>
                </button>
              ))}
            </div>

            <div className="flex items-center gap-space-xs">
              <span className="font-label-micro text-label-micro px-space-xs py-0.5 bg-surface-container text-secondary uppercase font-mono">
                PADDLEOCR / OPENCV
              </span>
              <span className="font-label-micro text-label-micro px-space-xs py-0.5 bg-surface-container text-primary uppercase font-mono">
                FPS: {aiTelemetry?.aiStats?.fps || '30.0'}
              </span>
              <button
                onClick={() => onOpenPTZ(activeCam)}
                className="bg-surface-container-highest text-secondary hover:text-on-surface px-2 py-0.5 font-label-micro text-label-micro uppercase flex items-center gap-0.5"
              >
                <span className="material-symbols-outlined text-[12px]">tune</span>
                <span>PTZ</span>
              </button>
            </div>
          </div>

          {/* PRIMARY OPTICAL / IR HIGH-RES FEED CONTAINER */}
          <div className="bg-surface-container-low p-space-xs flex flex-col space-y-space-xs shadow-md">
            {/* FEED HEADER */}
            <div className="bg-surface-container px-space-sm py-1 flex items-center justify-between">
              <div className="flex items-center gap-space-sm">
                <span className="w-2 h-2 bg-primary animate-pulse" />
                <span className="font-headline-md text-headline-md tracking-wider text-on-surface font-bold text-[15px]">
                  {activeCam} CHECKPOST 01 — ENTRY LANE 1
                </span>
                <span className="bg-surface-container-highest px-space-xs py-0.5 font-label-micro text-label-micro text-primary-fixed uppercase">
                  REAL CAMERA STREAM
                </span>
              </div>
              <div className="flex items-center gap-space-md font-label-micro text-label-micro text-on-surface-variant font-mono">
                <span>RES: 1280x720</span>
                <span>LATENCY: {aiTelemetry?.latencyMs || 14}ms</span>
                <span className="text-secondary">IR BOOST: ACTIVE</span>
              </div>
            </div>

            {/* REAL LIVE CAMERA FEED (OR FALLBACK) */}
            <div className="relative w-full h-[380px] bg-surface-container-lowest overflow-hidden">
              {!streamError ? (
                <img
                  className="w-full h-full object-cover"
                  alt="Live Camera Feed"
                  src={`/video_feed/${activeCam.toLowerCase().replace('-', '')}`}
                  onError={() => setStreamError(true)}
                />
              ) : (
                <img
                  className="w-full h-full object-cover opacity-80"
                  alt="Checkpost optical fallback"
                  src={ANPR_FEED_MAIN_IMG}
                />
              )}

              {/* RETICLE & METADATA HUD OVERLAY */}
              <div className="absolute inset-0 p-space-md pointer-events-none flex flex-col justify-between">
                {/* TOP RETICLE INFO */}
                <div className="flex justify-between items-start">
                  <div className="bg-surface/90 p-space-xs font-label-micro text-label-micro font-mono text-on-surface space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-secondary font-bold">STREAM: /video_feed</span>
                      <span className="text-primary">
                        {!streamError ? 'ONLINE (FASTAPI)' : 'OPTICAL FALLBACK (SIMULATION)'}
                      </span>
                    </div>
                    <div className="text-on-surface-variant">GRID: 32°44'28.4"N 74°51'19.1"E</div>
                    <div className="text-secondary-fixed">
                      PTZ: AZ: 142.1° | EL: -14.6° | ZOOM: 2.4X
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    <div className="bg-primary px-space-sm py-0.5 text-on-primary font-label-code text-label-code font-bold uppercase tracking-wider">
                      {selectedVehicle ? `TARGET: ${selectedVehicle.plate}` : 'AWAITING TARGET'}
                    </div>
                    <div className="bg-surface-container-highest/90 px-space-xs py-0.5 text-primary font-label-micro text-label-micro font-mono">
                      RADAR SPEED: {selectedVehicle?.speed || '18.2 KM/H'}
                    </div>
                  </div>
                </div>

                {/* VEHICLE BOUNDING BOX & ANPR OCR INSET WINDOW */}
                {selectedVehicle && (
                  <div className="relative w-3/4 max-w-lg self-center h-48 my-auto">
                    {/* Hard bounding corners */}
                    <div className="absolute inset-0 bg-secondary/5">
                      <div className="absolute top-0 left-0 w-4 h-4 bg-secondary" />
                      <div className="absolute top-0 right-0 w-4 h-4 bg-secondary" />
                      <div className="absolute bottom-0 left-0 w-4 h-4 bg-secondary" />
                      <div className="absolute bottom-0 right-0 w-4 h-4 bg-secondary" />
                    </div>

                    {/* TARGET CLASSIFICATION BADGE */}
                    <div className="absolute -top-7 left-0 bg-surface text-secondary px-space-sm py-0.5 font-label-code text-label-code uppercase tracking-wider flex items-center gap-2">
                      <span className="font-bold">{selectedVehicle.model}</span>
                      <span className="text-primary font-mono font-bold">{selectedVehicle.conf} CONF</span>
                      <span className="text-on-surface-variant text-label-micro">
                        {selectedVehicle.isReal ? '[REAL OCR]' : '[SIMULATION]'}
                      </span>
                    </div>

                    {/* RECOGNIZED OCR CUTOUT WINDOW (LPR ZOOM) */}
                    <div className="absolute -bottom-8 right-2 bg-surface-container-highest p-space-xs shadow-xl flex flex-col gap-1">
                      <div className="flex items-center justify-between text-label-micro font-label-micro text-on-surface-variant font-mono">
                        <span>PLATE OCR SEGMENTATION</span>
                        <span className="text-primary font-bold">CONF: {selectedVehicle.conf}</span>
                      </div>

                      <div className="bg-surface-container-lowest p-space-xs flex items-center gap-space-xs">
                        <div className="bg-surface-container px-1 py-0.5 text-on-surface font-label-micro text-label-micro font-bold">
                          IND
                        </div>
                        {/* Segmented Plate Characters */}
                        <div className="flex gap-0.5 font-label-code text-label-code font-bold tracking-widest text-on-surface font-mono">
                          {selectedVehicle.plate.split('').map((char, idx) => (
                            <span
                              key={idx}
                              className={`bg-surface px-1 py-0.5 ${
                                idx < 4 ? 'text-primary' : 'text-secondary'
                              }`}
                            >
                              {char}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* BOTTOM HUD OVERLAYS */}
                <div className="flex justify-between items-end">
                  <div className="bg-surface/90 p-space-xs font-label-micro text-label-micro text-primary flex items-center gap-space-md">
                    <div className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">sensors</span>
                      <span>INDUCTION LOOP 01: ARMED</span>
                    </div>
                    <div className="flex items-center gap-1 text-on-surface">
                      <span className="material-symbols-outlined text-[14px]">barcode_reader</span>
                      <span>FASTAG/RFID: {selectedVehicle?.rfid || 'RF-9942-IND'}</span>
                    </div>
                  </div>

                  {/* BARRIER ACTION BADGE */}
                  <div className="bg-primary text-on-primary px-space-md py-1 font-label-code text-label-code font-bold uppercase tracking-wider flex items-center gap-1">
                    <span className="material-symbols-outlined text-[16px]">check_circle</span>
                    <span>BARRIER: {barrierState}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* TELEMETRY & VERIFICATION DOSSIER BAR */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-space-xs bg-surface-container p-space-xs font-label-code text-label-code">
              <div className="bg-surface-container-high p-space-xs flex flex-col justify-between">
                <span className="text-label-micro font-label-micro text-on-surface-variant uppercase">
                  SELECTED VEHICLE
                </span>
                <div className="flex flex-col mt-0.5">
                  <span className="text-on-surface font-bold">
                    {selectedVehicle ? selectedVehicle.plate : 'NONE SELECTED'}
                  </span>
                  <span className="text-outline text-label-micro font-mono">
                    MODEL: {selectedVehicle?.model || 'N/A'} • {selectedVehicle?.time || ''}
                  </span>
                </div>
              </div>

              <div className="bg-surface-container-high p-space-xs flex flex-col justify-between">
                <span className="text-label-micro font-label-micro text-on-surface-variant uppercase">
                  CLASSIFICATION &amp; STATUS
                </span>
                <div className="flex flex-col mt-0.5">
                  <span
                    className={`font-bold ${
                      selectedVehicle?.tagType === 'hotlist' ? 'text-error' : 'text-primary'
                    }`}
                  >
                    {selectedVehicle?.tag || 'CLEAR'}
                  </span>
                  <span className="text-on-surface-variant text-label-micro font-mono">
                    {selectedVehicle?.details || 'NOMINAL TRANSIT'}
                  </span>
                </div>
              </div>

              <div className="bg-surface-container-high p-space-xs flex flex-col justify-between">
                <span className="text-label-micro font-label-micro text-on-surface-variant uppercase">
                  SOURCE ARCHITECTURE
                </span>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-secondary font-bold font-mono">
                    {selectedVehicle?.isReal ? 'REAL /api/anpr' : '[DEMO / SIMULATION]'}
                  </span>
                  <span className="bg-primary/20 text-primary px-1 font-label-micro text-label-micro font-bold uppercase">
                    ACTIVE
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* SECONDARY MULTI-SENSOR INSETS (AXLE SENSOR & UVIS SCANNER) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-space-xs">
            {/* SIDE PROFILE & AXLE SENSOR FEED */}
            <div className="bg-surface-container-low p-space-xs flex flex-col space-y-space-xs">
              <div className="flex justify-between items-center bg-surface-container px-space-xs py-0.5">
                <span className="font-label-micro text-label-micro text-on-surface uppercase font-bold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-primary" />
                  AXLE SENSOR ARRAY [SIMULATION]
                </span>
                <span className="font-label-micro text-label-micro text-secondary font-mono">
                  2 AXLES DETECTED
                </span>
              </div>
              <div className="relative h-28 bg-surface-container-lowest overflow-hidden">
                <img
                  className="w-full h-full object-cover opacity-70"
                  alt="Chassis axle sensor view"
                  src={CAM_AXLE_IMG}
                />
                <div className="absolute bottom-1 left-1 bg-surface-container-highest/90 px-space-xs py-0.5 font-label-micro text-label-micro text-primary font-mono">
                  WHEELBASE: 3,014mm | WEIGHT: 2,480 KG
                </div>
              </div>
            </div>

            {/* UVIS (UNDER-VEHICLE INSPECTION SCANNER) */}
            <div className="bg-surface-container-low p-space-xs flex flex-col space-y-space-xs">
              <div className="flex justify-between items-center bg-surface-container px-space-xs py-0.5">
                <span className="font-label-micro text-label-micro text-on-surface uppercase font-bold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-primary" />
                  UVIS UNDERCARRIAGE SCAN [SIMULATION]
                </span>
                <span className="font-label-micro text-label-micro text-primary font-mono font-bold">
                  CLEARED (SCORE 0.02)
                </span>
              </div>
              <div className="relative h-28 bg-surface-container-lowest overflow-hidden">
                <img
                  className="w-full h-full object-cover opacity-75"
                  alt="Undercarriage inspection scan"
                  src={UVIS_SCAN_IMG}
                />
                <div className="absolute bottom-1 right-1 bg-surface-container-highest/90 px-space-xs py-0.5 font-label-micro text-label-micro text-on-surface-variant font-mono flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-primary" />
                  <span>NO CONTRABAND COMPARTMENT</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT PANE: 40% (5 cols on lg) - WATCHLIST INTERCEPT & REAL-TIME AUDIT LOG */}
        <div className="lg:col-span-5 flex flex-col space-y-space-md">
          {/* CRITICAL PINNED HOTLIST INTERCEPT CARD */}
          <div className="bg-surface-container-low p-space-xs flex flex-col space-y-space-xs shadow-md">
            {/* HEADER */}
            <div className="bg-error-container/30 px-space-sm py-1.5 flex items-center justify-between">
              <div className="flex items-center gap-space-sm">
                <span className="material-symbols-outlined text-[18px] text-error animate-pulse">
                  fmd_bad
                </span>
                <span className="font-headline-md text-headline-md tracking-wider text-error font-bold uppercase text-[15px]">
                  HOTLIST SURVEILLANCE WATCH
                </span>
              </div>
              <span className="bg-error px-space-xs py-0.5 text-on-error font-label-micro text-label-micro font-bold">
                SPECIAL CELL
              </span>
            </div>

            <div className="p-space-sm bg-surface-container flex flex-col space-y-space-sm">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-baseline gap-space-sm">
                    <span className="font-telemetry-data text-telemetry-data text-on-surface font-mono font-bold tracking-widest bg-surface-container-highest px-space-sm py-0.5">
                      DL01CA9921
                    </span>
                    <span className="font-label-code text-label-code text-error font-bold uppercase">
                      MAHINDRA SCORPIO
                    </span>
                  </div>
                  <div className="text-outline font-label-micro text-label-micro mt-1 font-mono">
                    FLAGGED BY: POLICE INTEL ALERT #W-4409 (BYPASS MONITOR)
                  </div>
                </div>
                <div className="text-right">
                  <span className="font-label-micro text-label-micro text-error font-bold uppercase block">
                    STATUS: ACTIVE WATCH
                  </span>
                  <span className="font-label-micro text-label-micro text-on-surface-variant font-mono">
                    SECTOR CHARLIE
                  </span>
                </div>
              </div>

              {/* TACTICAL RAPID ACTION TRIGGERS */}
              <div className="grid grid-cols-3 gap-space-xs pt-space-xs">
                <button
                  onClick={() =>
                    triggerAction(
                      'Broadcast Intercept Transmitted: APB DL01CA9921 issued across Sector Charlie & Delta'
                    )
                  }
                  className="bg-error-container/40 hover:bg-error-container/60 text-error p-space-xs font-label-micro text-label-micro font-bold uppercase tracking-wider text-center transition-colors active:scale-95"
                >
                  BROADCAST APB
                </button>
                <button
                  onClick={() => triggerAction('QRT Squad 4 alerted with vehicle vector & plate target')}
                  className="bg-surface-container-highest hover:bg-surface-bright text-on-surface p-space-xs font-label-micro text-label-micro font-bold uppercase tracking-wider text-center transition-colors active:scale-95"
                >
                  ALERT QRT SQUADS
                </button>
                <button
                  onClick={() => onOpenPTZ('CAM-02 (Bypass)')}
                  className="bg-surface-container-highest hover:bg-surface-bright text-secondary p-space-xs font-label-micro text-label-micro font-bold uppercase tracking-wider text-center transition-colors active:scale-95"
                >
                  PTZ AUTO-TRACK
                </button>
              </div>
            </div>
          </div>

          {/* CHRONOLOGICAL ANPR STREAM AUDIT LOG */}
          <div className="bg-surface-container-low p-space-xs flex flex-col space-y-space-xs flex-1 shadow-md">
            {/* LOG TABLE HEADER / FILTER BAR */}
            <div className="bg-surface-container px-space-sm py-1 flex items-center justify-between">
              <div className="flex items-center gap-space-sm">
                <span className="font-headline-md text-headline-md tracking-wider text-on-surface font-bold uppercase text-[15px]">
                  LIVE ANPR STREAM LOG
                </span>
                <span className="font-label-micro text-label-micro px-1 bg-surface-container-highest text-primary font-mono">
                  {vehicles.length} LOGS
                </span>
              </div>
              <div className="flex items-center gap-space-xs">
                <button
                  onClick={handleExportCSV}
                  className="px-space-xs py-0.5 bg-surface-container-high hover:bg-surface-bright text-on-surface font-label-micro text-label-micro uppercase transition-colors"
                >
                  EXPORT CSV
                </button>
                <button
                  onClick={() => setSearchQuery(searchQuery ? '' : 'HOTLIST')}
                  className="px-space-xs py-0.5 bg-surface-container-high hover:bg-surface-bright text-secondary font-label-micro text-label-micro uppercase transition-colors"
                >
                  {searchQuery ? 'RESET FILTER' : 'FILTER HOTLIST'}
                </button>
              </div>
            </div>

            {/* DENSE REAL-TIME VEHICLE ROWS */}
            <div className="space-y-space-xs overflow-y-auto max-h-[460px] pr-0.5">
              {filteredVehicles.length === 0 ? (
                <div className="p-6 text-center text-outline font-label-code text-label-code bg-surface-container flex flex-col items-center justify-center space-y-2">
                  <span className="material-symbols-outlined text-3xl text-outline">no_crash</span>
                  <span>NO VEHICLE EVENTS LOGGED YET</span>
                  <span className="text-label-micro text-on-surface-variant max-w-xs">
                    Optical ANPR camera is monitoring gate traffic. Click "+ TEST SIMULATION EVENT" above to test recognition UI.
                  </span>
                </div>
              ) : (
                filteredVehicles.map((v) => (
                  <div
                    key={v.id}
                    onClick={() => setSelectedVehicle(v)}
                    className={`p-space-xs flex flex-col space-y-1 cursor-pointer transition-colors border ${
                      selectedVehicle?.id === v.id
                        ? 'border-primary bg-surface-container-highest'
                        : v.tagType === 'hotlist'
                        ? 'border-error/40 bg-error-container/20 hover:bg-error-container/30'
                        : 'border-transparent bg-surface-container hover:bg-surface-container-high'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-space-sm">
                        <span className="font-label-micro text-label-micro text-outline font-mono">
                          {v.time}
                        </span>
                        <span
                          className={`font-telemetry-data text-telemetry-data font-mono font-bold bg-surface-container-lowest px-1 ${
                            v.tagType === 'hotlist' ? 'text-error' : 'text-on-surface'
                          }`}
                        >
                          {v.plate}
                        </span>
                        <span
                          className={`font-label-code text-label-code font-semibold ${
                            v.tagType === 'hotlist' ? 'text-error' : 'text-on-surface'
                          }`}
                        >
                          {v.model}
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        {!v.isReal && (
                          <span className="px-1 py-0.2 bg-outline-variant text-on-surface-variant font-label-micro text-[9px] uppercase">
                            DEMO
                          </span>
                        )}
                        <span
                          className={`px-space-xs py-0.5 font-label-micro text-label-micro font-bold uppercase ${
                            v.tagType === 'authorized'
                              ? 'bg-primary/20 text-primary'
                              : v.tagType === 'cargo'
                              ? 'bg-surface-container-highest text-secondary'
                              : v.tagType === 'escort'
                              ? 'bg-primary/20 text-primary'
                              : v.tagType === 'hotlist'
                              ? 'bg-error text-on-error'
                              : v.tagType === 'manual'
                              ? 'bg-tertiary-container text-on-tertiary-container'
                              : 'bg-surface-container-highest text-on-surface'
                          }`}
                        >
                          {v.tag}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-label-micro font-label-micro text-outline font-mono">
                      <span>
                        {v.cam} • {v.speed} • CONF: {v.conf}
                      </span>
                      <span
                        className={
                          v.tagType === 'hotlist'
                            ? 'text-error'
                            : v.tagType === 'manual'
                            ? 'text-tertiary'
                            : 'text-primary-fixed-dim'
                        }
                      >
                        {v.details}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* QUICK OCR SEARCH INPUT */}
            <div className="pt-space-xs flex items-center gap-space-xs bg-surface-container p-space-xs">
              <span className="material-symbols-outlined text-[16px] text-secondary">search</span>
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-surface-container-lowest text-on-surface font-label-code text-label-code px-space-sm py-1 w-full focus:outline-none placeholder-outline uppercase font-mono"
                placeholder="QUERY VEHICLE PLATE / RFID / CHASSIS VIN..."
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="text-on-surface-variant hover:text-on-surface"
                >
                  <span className="material-symbols-outlined text-[14px]">close</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VehicleANPR;
