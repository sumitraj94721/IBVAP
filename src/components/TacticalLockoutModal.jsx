import React, { useState } from 'react';

export const TacticalLockoutModal = ({
  isOpen,
  onClose,
  onExecute,
}) => {
  const [sirenActive, setSirenActive] = useState(true);
  const [fenceEnergized, setFenceEnergized] = useState(true);
  const [qrfDispatched, setQrfDispatched] = useState(false);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4">
      <div className="bg-surface-container-low border-2 border-error w-full max-w-lg shadow-2xl p-space-md select-none">
        {/* Header Warning */}
        <div className="bg-error text-on-error px-3 py-1 flex items-center justify-between font-label-micro text-label-micro font-bold uppercase tracking-widest animate-pulse mb-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">warning</span>
            <span>TACTICAL ESCALATION — LEVEL 2 LOCKOUT</span>
          </div>
          <span>DEFCON-2 PROTOCOL</span>
        </div>

        <div className="space-y-3 font-body-sm text-body-sm">
          <div className="bg-error-container/20 border border-error/40 p-3">
            <div className="text-error font-headline-md text-headline-md font-bold uppercase mb-1">
              ARM BUFFER DEFENSE &amp; DISPATCH QRF-01
            </div>
            <p className="text-on-surface">
              Triggering this action will lock all perimeter motorized boom barriers, energize non-lethal acoustic deterrents along Sector Bravo, broadcast emergency telemetry to Northern Command SOC, and dispatch Quick Reaction Force (QRF-01).
            </p>
          </div>

          {/* Interactive Checkpoints */}
          <div className="space-y-1.5 font-label-code text-label-code">
            <label className="flex items-center gap-2 bg-surface-container p-2 cursor-pointer">
              <input
                type="checkbox"
                checked={sirenActive}
                onChange={(e) => setSirenActive(e.target.checked)}
                className="accent-error w-4 h-4"
              />
              <span className="text-on-surface">Auditory Sentry Siren (130dB Sector Bravo Array)</span>
            </label>

            <label className="flex items-center gap-2 bg-surface-container p-2 cursor-pointer">
              <input
                type="checkbox"
                checked={fenceEnergized}
                onChange={(e) => setFenceEnergized(e.target.checked)}
                className="accent-error w-4 h-4"
              />
              <span className="text-on-surface">Electrified Razor Wire Pulse Buffer (#ZONE-4B)</span>
            </label>

            <label className="flex items-center gap-2 bg-surface-container p-2 cursor-pointer">
              <input
                type="checkbox"
                checked={qrfDispatched}
                onChange={(e) => setQrfDispatched(e.target.checked)}
                className="accent-error w-4 h-4"
              />
              <span className="text-on-surface">Authorize Live Armed QRF-01 Tactical Intercept</span>
            </label>
          </div>

          {/* Operator Authentication */}
          <div className="bg-surface-container p-2 font-label-code text-label-code flex items-center justify-between border border-outline-variant">
            <div>
              <span className="text-outline text-label-micro block">AUTHORIZED OPERATOR</span>
              <span className="text-primary font-bold">TACTICAL COMMANDER (ADMIN #26187)</span>
            </div>
            <div className="text-right">
              <span className="text-outline text-label-micro block">SECTOR</span>
              <span className="text-secondary font-mono">SECTOR BRAVO (POONCH)</span>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center justify-end gap-2 mt-4 pt-2 border-t border-outline-variant">
          <button
            onClick={onClose}
            className="px-3 py-1.5 bg-surface-container-highest text-on-surface font-label-code text-label-code uppercase tracking-wider hover:bg-surface-bright"
          >
            Cancel / Abort
          </button>
          <button
            onClick={() => {
              if (onExecute) onExecute({ sirenActive, fenceEnergized, qrfDispatched });
              onClose();
            }}
            className="px-4 py-1.5 bg-error hover:bg-error/90 text-on-error font-label-code text-label-code uppercase tracking-wider font-bold shadow-lg flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[16px]">emergency</span>
            <span>EXECUTE TACTICAL LOCKOUT</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default TacticalLockoutModal;
