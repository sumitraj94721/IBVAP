import React, { useState, useEffect } from 'react';
import { INITIAL_DOSSIER } from '../types/tacticalTypes';

export const SecondaryViews = ({
  currentScreen = 'incident-dossiers',
  alerts = [],
  onAcknowledgeAlert = () => {},
  onIgnoreAlert = () => {},
  dossier = INITIAL_DOSSIER,
  onNavigateToScreen = () => {},
  onOpenLockout = () => {},
}) => {
  const [filterSeverity, setFilterSeverity] = useState('ALL');
  const [personSearchId, setPersonSearchId] = useState('P-023');
  const [realTracks, setRealTracks] = useState([]);

  useEffect(() => {
    let isMounted = true;
    const fetchTracks = async () => {
      try {
        const res = await fetch('/api/tracks');
        if (res.ok) {
          const data = await res.json();
          if (isMounted && data.tracks) {
            setRealTracks(data.tracks);
          }
        }
      } catch (e) {
        // Ignore error if offline
      }
    };
    fetchTracks();
    return () => {
      isMounted = false;
    };
  }, []);

  if (currentScreen === 'incident-dossiers') {
    return (
      <div className="flex flex-col w-full space-y-3 pb-6 select-none">
        <div className="bg-surface-container-low p-space-md flex items-center justify-between shadow-md">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary text-[22px]">folder_special</span>
            <span className="font-headline-md text-headline-md text-on-surface uppercase">
              FORENSIC INCIDENT DOSSIERS &amp; EVIDENCE ARCHIVE
            </span>
          </div>
          <span className="font-label-code text-label-code text-primary font-mono">
            SEC-ARCHIVE: SQLite VERIFIED
          </span>
        </div>

        <div className="bg-surface-container-low p-space-md shadow-md border border-outline-variant">
          <div className="flex items-center justify-between border-b border-outline-variant pb-2 mb-3">
            <div>
              <span className="font-headline-md text-headline-md text-error font-bold font-mono">
                {dossier.id} — BUFFER TRIPWIRE BREACH
              </span>
              <span className="font-label-micro text-label-micro text-on-surface-variant block mt-0.5">
                SECTOR BRAVO (POONCH BUFFER) • GRID: {dossier.coordinates}
              </span>
            </div>
            <span className="px-2 py-1 bg-error text-on-error font-label-micro text-label-micro font-bold uppercase">
              STATUS: UNDER ACTIVE ESCALATION
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 font-label-code text-label-code bg-surface-container p-3 mb-4">
            <div>
              <span className="text-outline text-label-micro block">TARGET IDENTIFIER</span>
              <span className="text-error font-bold font-mono text-[14px]">{dossier.targetId}</span>
            </div>
            <div>
              <span className="text-outline text-label-micro block">CONFIDENCE METRIC</span>
              <span className="text-on-surface font-mono text-[14px]">{dossier.classification} ({dossier.confidence})</span>
            </div>
            <div>
              <span className="text-outline text-label-micro block">ESTIMATED VELOCITY</span>
              <span className="text-tertiary font-mono text-[14px]">{dossier.velocity}</span>
            </div>
            <div>
              <span className="text-outline text-label-micro block">VECTOR BEARING</span>
              <span className="text-secondary font-mono text-[14px]">{dossier.bearing}</span>
            </div>
          </div>

          <div className="bg-surface-container-highest/60 p-3 mb-4">
            <span className="font-label-micro text-label-micro text-tertiary font-bold uppercase tracking-wider block mb-1">
              TACTICAL FORENSIC SUMMARY
            </span>
            <p className="font-body-md text-body-md text-on-surface leading-relaxed">
              {dossier.threatEvaluation}
            </p>
          </div>

          <div className="space-y-2">
            <span className="font-label-micro text-label-micro text-outline uppercase tracking-wider">
              STANDARD OPERATING PROCEDURE COMPLETION LOG
            </span>
            {dossier.sopSteps.map((step) => (
              <div
                key={step.title}
                className="flex items-center justify-between bg-surface-container px-3 py-2 text-on-surface"
              >
                <div className="flex items-center gap-2 font-label-code text-label-code">
                  <span className={`material-symbols-outlined text-[16px] ${step.completed ? 'text-primary' : 'text-outline'}`}>
                    {step.completed ? 'check_circle' : 'pending'}
                  </span>
                  <span>{step.title}</span>
                </div>
                <span className={`font-label-micro text-label-micro font-bold font-mono ${step.completed ? 'text-primary' : 'text-error'}`}>
                  {step.status}
                </span>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-outline-variant">
            <button
              onClick={() => onNavigateToScreen('master-console')}
              className="bg-primary text-on-primary px-4 py-1.5 font-label-code text-label-code font-bold uppercase tracking-wider hover:bg-primary-fixed-dim"
            >
              Open in Master Console
            </button>
            <button
              onClick={onOpenLockout}
              className="bg-error text-on-error px-4 py-1.5 font-label-code text-label-code font-bold uppercase tracking-wider hover:bg-error/90"
            >
              Execute Level 2 SOP
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full space-y-3 pb-6 select-none">
      <div className="bg-surface-container-low p-space-md flex flex-wrap items-center justify-between gap-2 shadow-md">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-secondary text-[22px]">person_search</span>
          <span className="font-headline-md text-headline-md text-on-surface uppercase">
            MULTI-OBJECT BYTETRACK &amp; SPATIAL TRAJECTORY
          </span>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={personSearchId}
            onChange={(e) => setPersonSearchId(e.target.value)}
            placeholder="SEARCH TRACK ID (e.g. P-023)"
            className="bg-surface-container-lowest border border-outline-variant px-2 py-1 font-label-code text-label-code uppercase text-primary font-mono focus:outline-none"
          />
        </div>
      </div>

      {realTracks.length > 0 && (
        <div className="bg-surface-container-low p-3 border border-outline-variant">
          <span className="font-label-micro text-label-micro text-primary uppercase font-bold block mb-2">
            REAL TRACKS IN DATABASE (/api/tracks): {realTracks.length}
          </span>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {realTracks.slice(0, 6).map((trk, idx) => (
              <div key={idx} className="bg-surface-container p-2 font-label-code text-label-code border border-outline-variant">
                <div className="flex justify-between">
                  <span className="text-primary font-bold">TRACK #{trk.track_id}</span>
                  <span className="text-secondary uppercase">{trk.class_name}</span>
                </div>
                <div className="text-outline text-label-micro mt-1 font-mono">
                  CAM: {trk.camera_id} | CONF: {(trk.max_confidence * 100).toFixed(1)}%
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="bg-surface-container-low p-4 shadow-md border border-outline-variant">
          <div className="flex items-center justify-between mb-3 border-b border-outline-variant pb-2">
            <span className="font-headline-md text-headline-md text-primary font-bold">
              TRACK #{personSearchId} CORRELATION VECTOR
            </span>
            <span className="bg-primary/20 text-primary px-2 py-0.5 font-label-micro text-label-micro font-bold">
              CONFIDENCE: 94.2%
            </span>
          </div>

          <div className="space-y-2 font-label-code text-label-code text-on-surface-variant">
            <div className="flex justify-between bg-surface-container p-2">
              <span>CLASSIFICATION:</span>
              <span className="text-on-surface font-bold">AUTHORIZED BSF PATROL</span>
            </div>
            <div className="flex justify-between bg-surface-container p-2">
              <span>PATH HOPPING:</span>
              <span className="text-secondary font-mono">CAM-01 → CAM-02</span>
            </div>
            <div className="flex justify-between bg-surface-container p-2">
              <span>SPEED &amp; GAIT:</span>
              <span className="text-on-surface font-mono">1.4 m/s NNE (STEADY MARCH)</span>
            </div>
          </div>

          <div className="mt-4 pt-2 border-t border-outline-variant flex justify-end">
            <button
              onClick={() => onNavigateToScreen('dashboard')}
              className="bg-secondary text-on-secondary px-3 py-1 font-label-code text-label-code font-bold uppercase tracking-wider"
            >
              Track on Video Feeds
            </button>
          </div>
        </div>

        <div className="bg-surface-container-low p-4 shadow-md border border-outline-variant">
          <div className="flex items-center justify-between mb-3 border-b border-outline-variant pb-2">
            <span className="font-headline-md text-headline-md text-error font-bold">
              HOSTILE INTRUDER: TRACK #P-019
            </span>
            <span className="bg-error text-on-error px-2 py-0.5 font-label-micro text-label-micro font-bold">
              BREACH MONITOR
            </span>
          </div>

          <div className="space-y-2 font-label-code text-label-code text-on-surface-variant">
            <div className="flex justify-between bg-surface-container p-2">
              <span>CLASSIFICATION:</span>
              <span className="text-error font-bold">UNAUTHORIZED TARGET</span>
            </div>
            <div className="flex justify-between bg-surface-container p-2">
              <span>INCURSION VECTOR:</span>
              <span className="text-error font-mono">GRID PK-IND-324 (TRIPWIRE-ALPHA)</span>
            </div>
            <div className="flex justify-between bg-surface-container p-2">
              <span>VELOCITY:</span>
              <span className="text-tertiary font-mono">2.1 m/s (RUNNING)</span>
            </div>
          </div>

          <div className="mt-4 pt-2 border-t border-outline-variant flex justify-end">
            <button
              onClick={() => onNavigateToScreen('twin')}
              className="bg-error text-on-error px-3 py-1 font-label-code text-label-code font-bold uppercase tracking-wider"
            >
              View on Digital Twin Map
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SecondaryViews;
