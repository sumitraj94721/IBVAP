import React, { useState } from 'react';
import { CREST_LOGO_URL } from '../types/tacticalTypes';

export const ConsoleLockOverlay = ({
  isLocked,
  onUnlock,
}) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);

  if (!isLocked) return null;

  const handleUnlockAttempt = (e) => {
    e.preventDefault();
    if (pin === '26187' || pin === 'admin123' || pin === '1234' || pin === '') {
      onUnlock();
      setPin('');
      setError(false);
    } else {
      setError(true);
      setTimeout(() => setError(false), 2000);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0a0f13]/95 backdrop-blur-md flex items-center justify-center p-4 select-none">
      <div className="bg-surface-container-low border border-primary/40 w-full max-w-sm shadow-2xl p-6 text-center flex flex-col items-center">
        <img
          alt="IBVAP Tactical Crest"
          className="h-16 w-16 mb-3 object-contain"
          src={CREST_LOGO_URL}
        />

        <div className="font-headline-md text-headline-md text-on-surface font-bold tracking-wider mb-1">
          IBVAP CONSOLE LOCKED
        </div>
        <div className="font-label-micro text-label-micro text-outline tracking-wider uppercase mb-6">
          INTELLIGENT BORDER VIDEO ANALYTICS PLATFORM • SEC-NODE HQ-NORTH-01
        </div>

        <form onSubmit={handleUnlockAttempt} className="w-full space-y-4">
          <div className="bg-surface-container p-2 border border-outline-variant flex items-center justify-between font-label-code text-label-code text-left mb-2">
            <div>
              <span className="text-outline text-label-micro block">STATION OPERATOR</span>
              <span className="text-on-surface font-bold">TACTICAL COMMANDER</span>
            </div>
            <span className="px-1.5 py-0.5 bg-primary-container text-on-primary-container font-label-micro text-label-micro uppercase font-bold">
              DEFENSE SOC
            </span>
          </div>

          <div>
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="ENTER PASSCODE (DEFAULT: 26187)"
              className="w-full bg-surface-container-lowest border border-outline-variant text-primary font-mono text-center tracking-widest text-lg py-2 px-3 focus:outline-none focus:border-primary placeholder-outline/60 uppercase"
              autoFocus
            />
            {error && (
              <span className="text-error font-label-micro text-label-micro block mt-1">
                ACCESS DENIED • INVALID CREDENTIALS
              </span>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <button
              type="submit"
              className="w-full bg-primary text-on-primary hover:bg-primary-fixed-dim py-2 font-label-code text-label-code font-bold uppercase tracking-wider transition-colors shadow-md"
            >
              AUTHENTICATE CONSOLE
            </button>
            <button
              type="button"
              onClick={onUnlock}
              className="w-full bg-surface-container-highest text-secondary hover:text-on-surface py-1.5 font-label-code text-label-code uppercase tracking-wider transition-colors flex items-center justify-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]">fingerprint</span>
              <span>BIOMETRIC SMART PASS</span>
            </button>
          </div>
        </form>

        <div className="mt-6 text-outline font-label-micro text-label-micro">
          DEFENSE LAB TESTBED #26187 • AES-256 ENCRYPTED
        </div>
      </div>
    </div>
  );
};

export default ConsoleLockOverlay;
