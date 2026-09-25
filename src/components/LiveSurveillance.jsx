import React, { useState } from 'react';

export const LiveSurveillance = ({
  onOpenPTZ = () => {},
  onTakeSnapshot = () => {},
  onNavigateToScreen = () => {},
}) => {
  const [layout, setLayout] = useState('2x2');
  const [selectedCamIndex, setSelectedCamIndex] = useState(0);
  const [isThermal, setIsThermal] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordNotice, setRecordNotice] = useState(null);
  const [streamErrors, setStreamErrors] = useState({});

  const realCamFeeds = [
    {
      id: 'cam-01',
      code: 'CAM-01',
      sector: 'SECTOR-ALPHA (FORWARD OPTICAL)',
      resolution: '1280x720@30',
      preset: 'PRESET: P01 (FORWARD AZ +0.0°)',
      url: '/video_feed/cam1',
      status: 'ONLINE',
      fps: 29.8,
      latency: 11,
      detections: 2,
      irActive: false,
    },
    {
      id: 'cam-02',
      code: 'CAM-02',
      sector: 'SECTOR-BRAVO (BORDER TRIPWIRE)',
      resolution: '1280x720@30 IR',
      preset: 'PRESET: P02 (TRIPWIRE OVERWATCH)',
      url: '/video_feed/cam2',
      status: 'ALERT',
      fps: 30.1,
      latency: 14,
      detections: 1,
      irActive: true,
    },
    {
      id: 'cam-03',
      code: 'CAM-03',
      sector: 'SECTOR-CHARLIE (CHECKPOST ANPR)',
      resolution: '1920x1080@30',
      preset: 'GATE SENSOR: ACTIVE',
      url: '/video_feed/cam3',
      status: 'ONLINE',
      fps: 29.9,
      latency: 9,
      detections: 1,
      irActive: false,
    },
    {
      id: 'cam-04',
      code: 'CAM-04',
      sector: 'SECTOR-DELTA (ELEVATED RADAR TOWER)',
      resolution: '1280x720@30',
      preset: 'SWEEP ANGLE: 310° AZ',
      url: '/video_feed/cam4',
      status: 'ONLINE',
      fps: 30.0,
      latency: 12,
      detections: 0,
      radarIntegrated: true,
      irActive: false,
    },
  ];

  const toggleRecording = () => {
    if (!isRecording) {
      setIsRecording(true);
      setRecordNotice('RECORDING INITIATED: Encrypted stream saving to Forensic NAS #SEC-REC-01 (SHA-256)');
    } else {
      setIsRecording(false);
      setRecordNotice('RECORDING ARCHIVED: 1080p H.265 tactical clip saved with digital signature.');
    }
    setTimeout(() => setRecordNotice(null), 3500);
  };

  const handleStreamError = (id) => {
    setStreamErrors((prev) => ({ ...prev, [id]: true }));
  };

  return (
    <div className="flex flex-col w-full text-on-surface select-none pb-6 space-y-3">
      {/* Top Banner Status */}
      {recordNotice && (
        <div className="bg-error-container text-on-error-container px-3 py-1 font-label-code text-label-code font-bold uppercase tracking-wider flex items-center justify-between shadow-md">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px] animate-pulse">radio_button_checked</span>
            <span>{recordNotice}</span>
          </div>
          <button onClick={() => setRecordNotice(null)}>
            <span className="material-symbols-outlined text-[14px]">close</span>
          </button>
        </div>
      )}

      {/* Ribbon Control Toolbar */}
      <div className="bg-surface-container-low px-space-md py-2 flex flex-wrap items-center justify-between gap-space-sm shadow-md">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-primary text-[20px]">videocam</span>
          <span className="font-headline-md text-headline-md uppercase tracking-wider text-on-surface">
            FULL MATRIX LIVE SURVEILLANCE
          </span>
          <span className="px-1.5 py-0.5 bg-surface-container-highest text-primary font-label-micro text-label-micro uppercase">
            REAL VIDEO STREAMS (/video_feed)
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Layout switches */}
          <div className="flex bg-surface-container-lowest p-0.5 border border-outline-variant">
            <button
              onClick={() => setLayout('1x1')}
              className={`px-2 py-0.5 font-label-code text-label-code uppercase ${
                layout === '1x1' ? 'bg-primary text-on-primary font-bold' : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              1x1
            </button>
            <button
              onClick={() => setLayout('2x2')}
              className={`px-2 py-0.5 font-label-code text-label-code uppercase ${
                layout === '2x2' ? 'bg-primary text-on-primary font-bold' : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              2x2
            </button>
            <button
              onClick={() => setLayout('3x3')}
              className={`px-2 py-0.5 font-label-code text-label-code uppercase ${
                layout === '3x3' ? 'bg-primary text-on-primary font-bold' : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              3x3 (ALL)
            </button>
          </div>

          {/* Thermal filter */}
          <button
            onClick={() => setIsThermal(!isThermal)}
            className={`px-2.5 py-1 font-label-code text-label-code uppercase tracking-wider transition-colors ${
              isThermal ? 'bg-secondary text-on-secondary font-bold' : 'bg-surface-container-highest text-on-surface hover:bg-surface-bright'
            }`}
          >
            {isThermal ? 'THERMAL FLIR ON' : 'THERMAL FLIR'}
          </button>

          {/* Record Stream */}
          <button
            onClick={toggleRecording}
            className={`px-2.5 py-1 font-label-code text-label-code uppercase tracking-wider flex items-center gap-1.5 transition-colors ${
              isRecording ? 'bg-error text-on-error font-bold animate-pulse' : 'bg-surface-container-highest text-error hover:bg-surface-bright'
            }`}
          >
            <span className="material-symbols-outlined text-[14px]">
              {isRecording ? 'stop_circle' : 'fiber_manual_record'}
            </span>
            <span>{isRecording ? 'REC ACTIVE' : 'RECORD FEED'}</span>
          </button>

          {/* Snapshot All */}
          <button
            onClick={onTakeSnapshot}
            className="bg-surface-container-highest hover:bg-surface-bright text-on-surface px-2.5 py-1 font-label-code text-label-code uppercase tracking-wider flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[14px]">photo_camera</span>
            <span>SNAPSHOT</span>
          </button>
        </div>
      </div>

      {/* Video Feeds Grid */}
      <div
        className={`grid gap-2 bg-surface-container-lowest p-2 shadow-inner ${
          layout === '1x1'
            ? 'grid-cols-1'
            : layout === '2x2'
            ? 'grid-cols-1 md:grid-cols-2'
            : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
        }`}
      >
        {realCamFeeds.map((feed, index) => {
          if (layout === '1x1' && index !== selectedCamIndex) return null;
          const hasError = streamErrors[feed.id];

          return (
            <div
              key={feed.id}
              onClick={() => setSelectedCamIndex(index)}
              className={`relative bg-surface aspect-video overflow-hidden border cursor-pointer group ${
                selectedCamIndex === index ? 'border-primary' : 'border-outline-variant'
              } ${isThermal ? 'filter invert hue-rotate-180 contrast-125' : ''}`}
            >
              {!hasError ? (
                <img
                  src={feed.url}
                  alt={feed.code}
                  className="w-full h-full object-cover"
                  onError={() => handleStreamError(feed.id)}
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center bg-surface-container-low p-4 text-center">
                  <span className="material-symbols-outlined text-4xl text-outline mb-2">videocam_off</span>
                  <span className="font-label-code text-on-surface font-bold">{feed.code}</span>
                  <span className="font-label-micro text-on-surface-variant">{feed.sector}</span>
                  <span className="font-label-micro text-secondary mt-1">OPTICAL STANDBY • {feed.resolution}</span>
                </div>
              )}

              {/* Feed Header HUD */}
              <div className="absolute top-1 left-2 right-2 flex items-center justify-between font-label-micro text-label-micro pointer-events-none">
                <div className="bg-surface-container-lowest/90 px-1.5 py-0.5 flex items-center gap-1.5">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      feed.status === 'ALERT' ? 'bg-error animate-ping' : 'bg-primary'
                    }`}
                  />
                  <span className="text-on-surface font-bold">{feed.code}</span>
                  <span className="text-outline-variant">|</span>
                  <span className="text-on-surface-variant">{feed.sector}</span>
                  <span className="text-outline-variant">|</span>
                  <span className="text-secondary font-mono">{feed.resolution}</span>
                </div>
                <div className="bg-surface-container-lowest/90 px-1.5 py-0.5 text-primary font-mono">
                  {feed.preset}
                </div>
              </div>

              {/* Center Crosshairs */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-30">
                <div className="w-10 h-10 border border-secondary flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-secondary" />
                </div>
              </div>

              {/* Bottom Telemetry HUD */}
              <div className="absolute bottom-1 left-2 right-2 flex items-center justify-between font-label-micro text-label-micro">
                <div className="bg-surface-container-lowest/90 px-1 py-0.5 text-on-surface-variant font-mono">
                  FPS: {feed.fps} | LAT: {feed.latency}ms | {feed.url}
                </div>

                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenPTZ(feed.code);
                    }}
                    className="bg-surface-container-highest/95 hover:bg-secondary hover:text-on-secondary text-secondary px-1.5 py-0.5 font-label-micro text-label-micro uppercase pointer-events-auto"
                  >
                    PTZ SLEW
                  </button>
                  <span className="bg-primary/20 text-primary px-1 py-0.5 font-mono">
                    REAL FEED
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected Camera Inspector Dock */}
      <div className="bg-surface-container-low p-space-md flex flex-wrap items-center justify-between gap-space-sm font-label-code text-label-code">
        <div className="flex items-center gap-space-sm">
          <span className="text-outline uppercase">SELECTED FEED:</span>
          <span className="text-primary font-bold font-mono">
            {realCamFeeds[selectedCamIndex].code} ({realCamFeeds[selectedCamIndex].sector})
          </span>
          <span className="text-outline-variant">|</span>
          <span className="text-secondary font-mono">{realCamFeeds[selectedCamIndex].resolution}</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => onOpenPTZ(realCamFeeds[selectedCamIndex].code)}
            className="px-3 py-1 bg-secondary text-on-secondary uppercase font-bold tracking-wider hover:brightness-110 active:scale-95 transition-all"
          >
            Launch PTZ Pad
          </button>
          <button
            onClick={onTakeSnapshot}
            className="px-3 py-1 bg-surface-container-highest hover:bg-surface-bright text-on-surface uppercase tracking-wider"
          >
            Isolate Frame
          </button>
        </div>
      </div>
    </div>
  );
};

export default LiveSurveillance;
