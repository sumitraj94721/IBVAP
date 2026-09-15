import React from 'react';

export default function EventTimeline({ timeline, onClearEvents }) {
  return (
    <div className="timeline-card">
      <div className="map-header" style={{ marginBottom: 8 }}>
        <div className="map-title">
          <span>📜</span>
          <span>BORDER SURVEILLANCE AUDIT &amp; REAL-TIME EVENT TIMELINE</span>
        </div>
        {onClearEvents && (
          <button 
            className="btn-filter" 
            onClick={onClearEvents}
            style={{ fontSize: 10, padding: '3px 8px' }}
          >
            CLEAR LOG VIEW
          </button>
        )}
      </div>

      <div className="timeline-list">
        {timeline.map((item) => {
          const isCritical = item.severity === 'CRITICAL';
          const isHigh = item.severity === 'HIGH';

          return (
            <div key={item.id} className="timeline-entry">
              <div className="timeline-time">{item.time}</div>
              <div 
                className="timeline-dot" 
                style={{
                  background: isCritical ? 'var(--alert-red)' : isHigh ? 'var(--warning-amber)' : 'var(--cyan-glow)'
                }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ 
                    fontFamily: 'var(--font-ui)', 
                    fontWeight: 700, 
                    color: isCritical ? '#ff6b6b' : 'var(--text-main)',
                    fontSize: 12
                  }}>
                    {item.title}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--cyan-glow)', background: 'var(--cyan-dim)', padding: '1px 5px', borderRadius: 2 }}>
                    {item.sector}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text-dim)', marginLeft: 'auto' }}>
                    [{item.type}]
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                  {item.details}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
