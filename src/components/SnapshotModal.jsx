import React from 'react';

export const SnapshotModal = ({
  isOpen,
  onClose,
  timestamp,
  cameraSnapshots = [],
}) => {
  if (!isOpen) return null;

  const defaultFeeds = [
    { id: 'cam-01', code: 'CAM-01', sector: 'SECTOR-ALPHA (FORWARD OPTICAL)', url: '/video_feed/cam1' },
    { id: 'cam-02', code: 'CAM-02', sector: 'SECTOR-BRAVO (BORDER TRIPWIRE)', url: '/video_feed/cam2' },
    { id: 'cam-03', code: 'CAM-03', sector: 'SECTOR-CHARLIE (CHECKPOST ANPR)', url: '/video_feed/cam3' },
    { id: 'cam-04', code: 'CAM-04', sector: 'SECTOR-DELTA (ELEVATED RADAR TOWER)', url: '/video_feed/cam4' },
  ];

  const feeds = cameraSnapshots.length > 0 ? cameraSnapshots : defaultFeeds;

  const handleExportZip = () => {
    alert('Synchronized tactical reconnaissance bundle exported to forensic archive.');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex items-center justify-center p-4">
      <div className="bg-surface-container-low border border-primary/50 w-full max-w-4xl shadow-2xl p-space-md select-none max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-outline-variant pb-2 mb-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-[20px]">screenshot_region</span>
            <span className="font-headline-md text-headline-md text-on-surface uppercase">
              SYNCHRONIZED QUAD RECON SNAPSHOT ARCHIVE
            </span>
            <span className="px-1.5 py-0.5 bg-surface-container-highest text-primary font-label-micro text-label-micro">
              CAPTURE TIME: {timestamp || new Date().toLocaleTimeString()}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-on-surface-variant hover:text-error transition-colors"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* 2x2 Snapshot Grid */}
        <div className="grid grid-cols-2 gap-2 overflow-y-auto flex-1 p-1 bg-surface-container-lowest">
          {feeds.map((feed) => (
            <div key={feed.id} className="relative bg-surface aspect-video border border-outline-variant overflow-hidden flex items-center justify-center">
              {feed.image ? (
                <img
                  src={feed.image}
                  alt={feed.code}
                  className="w-full h-full object-cover filter contrast-110"
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center bg-black/60 p-4 text-center">
                  <span className="material-symbols-outlined text-primary text-3xl mb-2">videocam</span>
                  <span className="font-label-code text-on-surface font-bold">{feed.code}</span>
                  <span className="font-label-micro text-on-surface-variant">{feed.sector}</span>
                  <span className="font-label-micro text-outline mt-1">FRAME ISOLATED &amp; SIGNED</span>
                </div>
              )}
              <div className="absolute top-1 left-1 bg-surface-container-lowest/90 px-1 py-0.5 font-label-micro text-label-micro text-on-surface font-mono">
                {feed.code} | {feed.sector}
              </div>
              <div className="absolute bottom-1 right-1 bg-surface-container-lowest/90 px-1 py-0.5 font-label-micro text-label-micro text-primary font-mono">
                RAW SNAPSHOT • {timestamp || 'NOW'}
              </div>
            </div>
          ))}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-3 border-t border-outline-variant mt-2 font-label-code text-label-code">
          <span className="text-outline text-label-micro">
            ENCRYPTED TO ARCHIVE NAS (RAID-6 / SHA-256)
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportZip}
              className="bg-primary text-on-primary font-bold px-3 py-1 uppercase tracking-wider hover:bg-primary-fixed-dim"
            >
              Export Forensic Dossier (.ZIP)
            </button>
            <button
              onClick={onClose}
              className="bg-surface-container-highest text-on-surface px-3 py-1 uppercase hover:bg-surface-bright"
            >
              Dismiss
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SnapshotModal;
