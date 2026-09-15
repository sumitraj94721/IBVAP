import React from 'react';

export default function Sidebar({ 
  currentTab, 
  setCurrentTab, 
  alertsCount, 
  onTriggerDrill, 
  onToggleMute, 
  isMuted,
  onLogout 
}) {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: '📊' },
    { id: 'surveillance', label: 'Live Surveillance', icon: '📹' },
    { id: 'map', label: 'Border Map', icon: '🗺️' },
    { id: 'alerts', label: 'Alerts', icon: '🚨', badge: alertsCount },
    { id: 'analytics', label: 'AI Analytics', icon: '🧠' },
    { id: 'cameras', label: 'Camera Network', icon: '📡' },
    { id: 'history', label: 'Event History', icon: '📜' },
    { id: 'settings', label: 'Settings', icon: '⚙️' },
  ];

  return (
    <aside className="soc-nav-sidebar">
      <div className="nav-section-title">COMMAND NAVIGATION</div>
      
      {navItems.map((item) => (
        <button
          key={item.id}
          className={`nav-item ${currentTab === item.id ? 'active' : ''}`}
          onClick={() => setCurrentTab(item.id)}
        >
          <span>{item.icon}</span>
          <span>{item.label}</span>
          {item.badge > 0 && <span className="nav-badge">{item.badge}</span>}
        </button>
      ))}

      <div className="sidebar-spacer"></div>

      <div className="sidebar-controls">
        <button 
          className="btn-sidebar-drill" 
          onClick={onTriggerDrill}
          title="Simulate immediate border breach alert for demonstration"
        >
          <span>⚠️</span>
          <span>TRIGGER INTRUSION DRILL</span>
        </button>

        <button 
          className="btn-sidebar-audio" 
          onClick={onToggleMute}
          title="Toggle synthetic radar sound effects"
        >
          <span>{isMuted ? '🔇' : '🔊'}</span>
          <span>{isMuted ? 'AUDIO MUTED' : 'AUDIO ACTIVE'}</span>
        </button>

        <button 
          className="nav-item" 
          style={{ color: '#ff7676', marginTop: 4 }} 
          onClick={onLogout}
        >
          <span>🔒</span>
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}
