import React, { useState } from 'react';
import { SECTOR_MAP_DATA } from '../data/mockData';

export default function TacticalBorderMap({ alerts, onSelectSector }) {
  const [selectedSector, setSelectedSector] = useState(SECTOR_MAP_DATA[1]); // Default to Sector Bravo

  return (
    <div className="tactical-map-container">
      <div className="map-header">
        <div className="map-title">
          <span>🗺️</span>
          <span>INTEGRATED TACTICAL BORDER GIS GRID [SECTORS ALPHA - DELTA]</span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--cyan-glow)' }}>
          GRID REF: 32°11'N / 74°52'E // DATUM: WGS84
        </div>
      </div>

      <div className="map-svg-wrap">
        <svg
          viewBox="0 0 900 360"
          style={{ width: '100%', height: '100%' }}
        >
          <defs>
            {/* Radar Sweep Gradient */}
            <radialGradient id="radarSweep" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="rgba(0, 240, 255, 0.35)" />
              <stop offset="70%" stopColor="rgba(0, 240, 255, 0.08)" />
              <stop offset="100%" stopColor="rgba(0, 240, 255, 0)" />
            </radialGradient>

            <pattern id="tacticalGrid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(0, 240, 255, 0.07)" strokeWidth="1" />
            </pattern>
          </defs>

          {/* Grid Background */}
          <rect width="900" height="360" fill="url(#tacticalGrid)" />

          {/* International Border Fence line */}
          <path
            d="M 10 170 Q 250 140 450 175 T 890 160"
            fill="none"
            stroke="#ef4444"
            strokeWidth="2.5"
            strokeDasharray="6,4"
          />
          <text x="20" y="162" fill="#ef4444" fontSize="9" fontFamily="monospace" fontWeight="bold">
            ZERO LINE / INTERNATIONAL BORDER FENCE
          </text>

          {/* Riverine Buffer Restricted Zone (Sector Charlie) */}
          <path
            d="M 440 80 Q 540 100 660 85 L 670 270 Q 550 250 430 280 Z"
            fill="rgba(59, 130, 246, 0.12)"
            stroke="rgba(59, 130, 246, 0.4)"
            strokeWidth="1.5"
            strokeDasharray="4,4"
          />
          <text x="460" y="115" fill="#60a5fa" fontSize="9" fontFamily="monospace">
            ~ RESTRICTED RIVERINE MARSH ~
          </text>

          {/* Patrol Road Path */}
          <path
            d="M 20 250 Q 260 220 460 245 T 880 230"
            fill="none"
            stroke="rgba(148, 163, 184, 0.35)"
            strokeWidth="3"
          />
          <text x="25" y="242" fill="#94a3b8" fontSize="8" fontFamily="monospace">
            TACTICAL PATROL ROAD (QRT CORRIDOR)
          </text>

          {/* Sector Boundary Dividing Lines */}
          <line x1="220" y1="20" x2="220" y2="340" stroke="rgba(45, 61, 87, 0.8)" strokeWidth="1.5" strokeDasharray="3,3" />
          <line x1="440" y1="20" x2="440" y2="340" stroke="rgba(45, 61, 87, 0.8)" strokeWidth="1.5" strokeDasharray="3,3" />
          <line x1="670" y1="20" x2="670" y2="340" stroke="rgba(45, 61, 87, 0.8)" strokeWidth="1.5" strokeDasharray="3,3" />

          {/* Sector Interactive Boxes */}
          {SECTOR_MAP_DATA.map((sec) => {
            const isSelected = selectedSector?.id === sec.id;
            return (
              <g 
                key={sec.id}
                onClick={() => {
                  setSelectedSector(sec);
                  if (onSelectSector) onSelectSector(sec);
                }}
                style={{ cursor: 'pointer' }}
              >
                <rect
                  x={sec.bounds.x}
                  y={sec.bounds.y}
                  width={sec.bounds.w}
                  height={sec.bounds.h}
                  fill={isSelected ? 'rgba(0, 240, 255, 0.1)' : 'rgba(15, 23, 42, 0.4)'}
                  stroke={isSelected ? 'var(--cyan-glow)' : 'rgba(45, 61, 87, 0.6)'}
                  strokeWidth={isSelected ? '2' : '1'}
                  rx="4"
                />
                <text
                  x={sec.bounds.x + 10}
                  y={sec.bounds.y + 20}
                  fill={isSelected ? '#00f0ff' : '#cbd5e1'}
                  fontSize="11"
                  fontFamily="'Chakra Petch', sans-serif"
                  fontWeight="bold"
                >
                  {sec.name} [{sec.code}]
                </text>
                <text
                  x={sec.bounds.x + 10}
                  y={sec.bounds.y + 35}
                  fill="#94a3b8"
                  fontSize="9"
                  fontFamily="monospace"
                >
                  STATUS: {sec.status}
                </text>
              </g>
            );
          })}

          {/* Camera Sensors with FOV Cones */}
          {/* CAM-01 (Sector Alpha) */}
          <g transform="translate(110, 180)">
            <path d="M 0 0 L -40 -60 L 40 -60 Z" fill="url(#radarSweep)" opacity="0.7" />
            <circle cx="0" cy="0" r="5" fill="#00f0ff" />
            <text x="10" y="4" fill="#00f0ff" fontSize="9" fontFamily="monospace" fontWeight="bold">CAM-01</text>
          </g>

          {/* CAM-02 (Sector Bravo) */}
          <g transform="translate(320, 190)">
            <path d="M 0 0 L -45 -70 L 45 -70 Z" fill="url(#radarSweep)" opacity="0.7" />
            <circle cx="0" cy="0" r="5" fill="#10b981" />
            <text x="10" y="4" fill="#10b981" fontSize="9" fontFamily="monospace" fontWeight="bold">CAM-02</text>
          </g>

          {/* CAM-03 (Sector Charlie) */}
          <g transform="translate(540, 200)">
            <path d="M 0 0 L -50 -60 L 30 -75 Z" fill="url(#radarSweep)" opacity="0.7" />
            <circle cx="0" cy="0" r="5" fill="#f59e0b" />
            <text x="10" y="4" fill="#f59e0b" fontSize="9" fontFamily="monospace" fontWeight="bold">CAM-03</text>
          </g>

          {/* CAM-04 (Sector Delta) */}
          <g transform="translate(760, 175)">
            <path d="M 0 0 L -35 -65 L 45 -60 Z" fill="url(#radarSweep)" opacity="0.7" />
            <circle cx="0" cy="0" r="5" fill="#00f0ff" />
            <text x="10" y="4" fill="#00f0ff" fontSize="9" fontFamily="monospace" fontWeight="bold">CAM-04</text>
          </g>

          {/* Active Pulsating Threat Locations */}
          {/* Threat 1: Sector Bravo Boundary Breach */}
          <g transform="translate(340, 135)">
            <circle cx="0" cy="0" r="16" fill="none" stroke="#ef4444" strokeWidth="1.5" opacity="0.6">
              <animate attributeName="r" values="6;22;6" dur="2s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.8;0.1;0.8" dur="2s" repeatCount="indefinite" />
            </circle>
            <circle cx="0" cy="0" r="5" fill="#ef4444" />
            <rect x="8" y="-14" width="95" height="15" fill="#0f172a" stroke="#ef4444" strokeWidth="1" rx="2" />
            <text x="12" y="-3" fill="#ff7676" fontSize="8" fontFamily="monospace" fontWeight="bold">
              BREACH: LOC_#01
            </text>
          </g>

          {/* Threat 2: Riverine Marsh Thermal Ingress */}
          <g transform="translate(560, 145)">
            <circle cx="0" cy="0" r="14" fill="none" stroke="#f59e0b" strokeWidth="1.5" opacity="0.6">
              <animate attributeName="r" values="5;18;5" dur="1.8s" repeatCount="indefinite" />
            </circle>
            <circle cx="0" cy="0" r="5" fill="#f59e0b" />
            <rect x="8" y="-14" width="95" height="15" fill="#0f172a" stroke="#f59e0b" strokeWidth="1" rx="2" />
            <text x="12" y="-3" fill="#fbbf24" fontSize="8" fontFamily="monospace" fontWeight="bold">
              THERMAL: LOC_#02
            </text>
          </g>

          {/* Patrol Unit Vehicles */}
          <g transform="translate(180, 248)">
            <rect x="-8" y="-5" width="16" height="10" fill="#10b981" rx="2" />
            <text x="12" y="3" fill="#34d399" fontSize="8" fontFamily="monospace">QRT-ALPHA (PATROL)</text>
          </g>
          <g transform="translate(730, 235)">
            <rect x="-8" y="-5" width="16" height="10" fill="#3b82f6" rx="2" />
            <text x="12" y="3" fill="#60a5fa" fontSize="8" fontFamily="monospace">GATE GUARD DELTA</text>
          </g>
        </svg>
      </div>

      {/* Selected Sector Details HUD */}
      {selectedSector && (
        <div style={{
          marginTop: 12,
          padding: '10px 14px',
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-tactical)',
          borderRadius: 4,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: 12
        }}>
          <div>
            <span style={{ color: 'var(--cyan-glow)', fontWeight: 700, fontFamily: 'var(--font-ui)' }}>
              SELECTED ZONE: {selectedSector.name}
            </span>
            <span style={{ margin: '0 12px', color: 'var(--text-dim)' }}>|</span>
            <span>Assigned Unit: <strong>{selectedSector.personnel}</strong></span>
            <span style={{ margin: '0 12px', color: 'var(--text-dim)' }}>|</span>
            <span>Surveillance Hardware: <strong>{selectedSector.cameras.join(', ')}</strong></span>
          </div>
          <div style={{
            color: selectedSector.status === 'CRITICAL' ? 'var(--alert-red)' : 'var(--warning-amber)',
            fontWeight: 700
          }}>
            SECURITY LEVEL: {selectedSector.status}
          </div>
        </div>
      )}

      {/* Map Legend */}
      <div className="map-legend">
        <div className="legend-item">
          <div className="legend-color" style={{ background: '#ef4444' }}></div>
          <span>International Border Fence</span>
        </div>
        <div className="legend-item">
          <div className="legend-color" style={{ background: 'var(--cyan-glow)' }}></div>
          <span>Surveillance Optical / Radar Cones</span>
        </div>
        <div className="legend-item">
          <div className="legend-color" style={{ background: '#3b82f6' }}></div>
          <span>Restricted Waterway Buffer</span>
        </div>
        <div className="legend-item">
          <div className="legend-color" style={{ background: '#10b981' }}></div>
          <span>Patrol Units (QRT)</span>
        </div>
        <div className="legend-item">
          <div className="legend-color" style={{ background: '#f59e0b' }}></div>
          <span>Active Threat Anomaly</span>
        </div>
      </div>
    </div>
  );
}
