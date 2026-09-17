// desktop/src/components/ResponderConsole.tsx
import React from 'react';

export default function ResponderConsole() {
  return (
    <div style={{ background: '#ffffff', padding: 20, borderRadius: 8, border: '1px solid #cbd5e1' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h3 style={{ margin: 0, color: '#dc2626' }}>🚨 Campus Emergency Quick-Response Dispatch</h3>
          <small style={{ color: '#64748b' }}>PSU Lingayen Campus Security & Medical Emergency Operations</small>
        </div>
        <span style={{ background: '#fee2e2', color: '#dc2626', padding: '4px 10px', borderRadius: 4, fontWeight: 'bold', fontSize: 12 }}>
          Dispatch Status: ON CALL
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ padding: 14, background: '#fef2f2', borderRadius: 6, border: '1px solid #fecaca' }}>
          <h4 style={{ margin: '0 0 8px 0', color: '#991b1b' }}>Active SOS Incident Protocol:</h4>
          <p style={{ fontSize: 13, color: '#451a03', margin: '4px 0' }}>
            1. Standby for incoming WebSocket audio sirens above.
          </p>
          <p style={{ fontSize: 13, color: '#451a03', margin: '4px 0' }}>
            2. Click <b>"Open in Google Maps"</b> to view student's precise GPS pin coordinates.
          </p>
          <p style={{ fontSize: 13, color: '#451a03', margin: '4px 0' }}>
            3. Review red-flag allergies and pre-existing conditions before physical field triage.
          </p>
        </div>

        <div style={{ padding: 14, background: '#f8fafc', borderRadius: 6, border: '1px solid #e2e8f0' }}>
          <h4 style={{ margin: '0 0 8px 0', color: '#334155' }}>Quick Response Unit Telemetry:</h4>
          <p style={{ fontSize: 13, margin: '4px 0' }}>Average Campus Response Time: <b>142 seconds</b></p>
          <p style={{ fontSize: 13, margin: '4px 0' }}>Dedicated Emergency Hotline: <b>(075) 542-6123</b></p>
          <p style={{ fontSize: 13, margin: '4px 0' }}>Infirmary Radio Frequency: <b>Ch-4 (PSU Security)</b></p>
        </div>
      </div>
    </div>
  );
}