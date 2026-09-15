import React from 'react';

export default function CameraStatusTable({ cameras }) {
  return (
    <div className="cam-table-card">
      <div className="map-header" style={{ padding: '12px 16px', margin: 0 }}>
        <div className="map-title">
          <span>📡</span>
          <span>BORDER SURVEILLANCE CAMERA HARDWARE &amp; NETWORK TELEMETRY</span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--status-green)' }}>
          ALL 4 OPTICAL NODES SYNCHRONIZED
        </div>
      </div>

      <table className="tactical-table">
        <thead>
          <tr>
            <th>CAMERA ID</th>
            <th>SECTOR &amp; LOCATION</th>
            <th>SENSOR PAYLOAD</th>
            <th>STATUS</th>
            <th>FPS</th>
            <th>LAST DETECTION</th>
            <th>SIGNAL STRENGTH</th>
            <th>COORDINATES</th>
          </tr>
        </thead>
        <tbody>
          {cameras.map((cam) => {
            const isOnline = cam.status === 'ONLINE';
            const signalBars = cam.signal === 'Strong' ? 4 : cam.signal === 'Moderate' ? 3 : 2;

            return (
              <tr key={cam.id}>
                <td>
                  <span className="cam-badge">{cam.id}</span>
                </td>
                <td>
                  <strong style={{ color: 'var(--text-main)' }}>{cam.sector}</strong>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{cam.name}</div>
                </td>
                <td>{cam.sensor}</td>
                <td>
                  <span 
                    className="status-tag"
                    style={{ color: isOnline ? 'var(--status-green)' : 'var(--warning-amber)' }}
                  >
                    ● {cam.status}
                  </span>
                </td>
                <td>
                  <span className="fps-tag">{cam.fps} FPS</span>
                </td>
                <td>
                  <span style={{ color: 'var(--cyan-glow)', fontWeight: 600 }}>
                    {cam.lastDetection}
                  </span>
                  <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>{cam.lastDetectionTime}</div>
                </td>
                <td>
                  <div className="signal-bar-wrap">
                    {[1, 2, 3, 4].map((bar) => (
                      <div 
                        key={bar}
                        className={`signal-bar ${bar <= signalBars ? 'active' : ''}`}
                        style={{ height: bar * 3 + 4 }}
                      />
                    ))}
                    <span style={{ fontSize: 10, marginLeft: 6, color: 'var(--text-muted)' }}>
                      {cam.signal}
                    </span>
                  </div>
                </td>
                <td>
                  <span style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--text-muted)' }}>
                    {cam.coordinates}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
