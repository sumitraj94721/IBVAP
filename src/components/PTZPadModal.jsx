import React, { useState } from 'react';

export const PTZPadModal = ({
  isOpen,
  onClose,
  selectedCam = 'CAM-01 (Bravo)',
}) => {
  const [pan, setPan] = useState(148.2);
  const [tilt, setTilt] = useState(-12.4);
  const [zoom, setZoom] = useState(2.4);
  const [activePreset, setActivePreset] = useState('P04');
  const [irActive, setIrActive] = useState(true);

  if (!isOpen) return null;

  const handlePan = (dPan) => setPan((p) => Number((p + dPan).toFixed(1)));
  const handleTilt = (dTilt) => setTilt((t) => Number((t + dTilt).toFixed(1)));
  const handleZoom = (dZoom) =>
    setZoom((z) => Number(Math.max(1, Math.min(10, z + dZoom)).toFixed(1)));

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-surface-container-low border border-secondary w-full max-w-md shadow-2xl p-space-md select-none">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-outline-variant pb-2 mb-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary text-[20px]">tune</span>
            <span className="font-headline-md text-headline-md text-on-surface uppercase">
              PTZ TACTICAL SLEW PAD
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-on-surface-variant hover:text-error transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Camera Selector info */}
        <div className="bg-surface-container p-2 mb-3 flex items-center justify-between font-label-code text-label-code">
          <div>
            <span className="text-outline text-label-micro block">TARGET CAMERA</span>
            <span className="text-secondary font-bold font-mono">{selectedCam}</span>
          </div>
          <div className="text-right">
            <span className="text-outline text-label-micro block">TELEMETRY</span>
            <span className="text-primary font-mono">
              AZ: {pan}° | EL: {tilt}° | {zoom}X
            </span>
          </div>
        </div>

        {/* Directional Cross Controller */}
        <div className="flex flex-col items-center justify-center my-4">
          <button
            onClick={() => handleTilt(1.0)}
            className="w-12 h-10 bg-surface-container-highest hover:bg-secondary hover:text-on-secondary text-secondary flex items-center justify-center border border-outline-variant mb-1 active:scale-95 transition-all"
            title="Tilt Up"
          >
            <span className="material-symbols-outlined">arrow_upward</span>
          </button>

          <div className="flex items-center gap-1">
            <button
              onClick={() => handlePan(-1.5)}
              className="w-10 h-12 bg-surface-container-highest hover:bg-secondary hover:text-on-secondary text-secondary flex items-center justify-center border border-outline-variant active:scale-95 transition-all"
              title="Pan Left"
            >
              <span className="material-symbols-outlined">arrow_back</span>
            </button>

            <div className="w-16 h-12 bg-surface flex flex-col items-center justify-center border border-outline font-label-micro text-label-micro text-outline font-mono">
              <span>SLEW</span>
              <span className="text-primary text-[9px]">LOCKED</span>
            </div>

            <button
              onClick={() => handlePan(1.5)}
              className="w-10 h-12 bg-surface-container-highest hover:bg-secondary hover:text-on-secondary text-secondary flex items-center justify-center border border-outline-variant active:scale-95 transition-all"
              title="Pan Right"
            >
              <span className="material-symbols-outlined">arrow_forward</span>
            </button>
          </div>

          <button
            onClick={() => handleTilt(-1.0)}
            className="w-12 h-10 bg-surface-container-highest hover:bg-secondary hover:text-on-secondary text-secondary flex items-center justify-center border border-outline-variant mt-1 active:scale-95 transition-all"
            title="Tilt Down"
          >
            <span className="material-symbols-outlined">arrow_downward</span>
          </button>
        </div>

        {/* Zoom & Optical Sliders */}
        <div className="grid grid-cols-2 gap-2 mb-3 bg-surface-container p-2 font-label-code text-label-code">
          <div className="flex items-center justify-between">
            <span className="text-on-surface-variant">OPTICAL ZOOM</span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => handleZoom(-0.5)}
                className="w-6 h-6 bg-surface-container-highest text-on-surface flex items-center justify-center hover:bg-secondary hover:text-on-secondary"
              >
                -
              </button>
              <span className="font-mono text-primary px-1">{zoom}x</span>
              <button
                onClick={() => handleZoom(0.5)}
                className="w-6 h-6 bg-surface-container-highest text-on-surface flex items-center justify-center hover:bg-secondary hover:text-on-secondary"
              >
                +
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <span className="text-on-surface-variant">IR ILLUMINATOR</span>
            <button
              onClick={() => setIrActive(!irActive)}
              className={`px-2 py-0.5 font-label-micro text-label-micro font-bold uppercase ${
                irActive ? 'bg-primary text-on-primary' : 'bg-surface-container-highest text-outline'
              }`}
            >
              {irActive ? 'ACTIVE' : 'OFF'}
            </button>
          </div>
        </div>

        {/* Presets Grid */}
        <div className="mb-3">
          <span className="font-label-micro text-label-micro text-outline uppercase block mb-1">
            HARDWARE PRESET ANCHORS
          </span>
          <div className="grid grid-cols-4 gap-1">
            {['P01 (GATE)', 'P02 (WIRE)', 'P03 (DEPOT)', 'P04 (BUFFER)'].map((preset) => (
              <button
                key={preset}
                onClick={() => setActivePreset(preset)}
                className={`py-1 text-center font-label-micro text-label-micro uppercase border transition-colors ${
                  activePreset === preset
                    ? 'border-secondary bg-secondary/20 text-secondary font-bold'
                    : 'border-outline-variant bg-surface-container text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        {/* Footer CTAs */}
        <div className="flex items-center justify-between pt-2 border-t border-outline-variant">
          <button
            onClick={() => {
              setPan(0);
              setTilt(0);
              setZoom(1.0);
            }}
            className="text-on-surface-variant hover:text-on-surface font-label-code text-label-code uppercase"
          >
            Reset Center
          </button>
          <button
            onClick={onClose}
            className="bg-secondary text-on-secondary px-3 py-1 font-label-code text-label-code font-bold uppercase tracking-wider"
          >
            Apply &amp; Lock Slew
          </button>
        </div>
      </div>
    </div>
  );
};

export default PTZPadModal;
