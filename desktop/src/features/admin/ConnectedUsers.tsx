import { useEffect, useState } from 'react';
import { API_BASE_URL } from '../../config/api';
import { btnGhost } from '../../theme';

type Session = {
  userId: number;
  name: string;
  email: string;
  roles: string[];
  loggedInAt: string | null;
  connectedSince: string;
  connections: number;
};

function duration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours) return `${hours}h ${minutes % 60}m`;
  return minutes ? `${minutes}m ${seconds % 60}s` : `${seconds}s`;
}

export default function ConnectedUsers() {
  const [snapshot, setSnapshot] = useState<{ sessions: Session[]; serverMs: number; receivedMs: number } | null>(null);
  const [failed, setFailed] = useState(false);
  const [clock, setClock] = useState(Date.now);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let request: AbortController | null = null;
    async function refresh() {
      if (request) return;
      const controller = new AbortController();
      request = controller;
      try {
        const token = localStorage.getItem('valetudo_token');
        const response = await fetch(`${API_BASE_URL}/api/admin/connected-users`, {
          headers: { Authorization: `Bearer ${token}` }, signal: controller.signal,
        });
        if (!response.ok) throw new Error('Presence unavailable');
        const data = await response.json();
        if (controller.signal.aborted) return;
        const receivedMs = Date.now();
        setClock(receivedMs);
        setSnapshot({ sessions: data.sessions, serverMs: Date.parse(data.sampledAt), receivedMs });
        setFailed(false);
      } catch {
        if (!controller.signal.aborted) {
          setSnapshot(null);
          setFailed(true);
        }
      } finally {
        if (request === controller) request = null;
      }
    }
    void refresh();
    const poll = window.setInterval(refresh, 15_000);
    const tick = window.setInterval(() => setClock(Date.now()), 1000);
    window.addEventListener('focus', refresh);
    return () => {
      request?.abort();
      window.removeEventListener('focus', refresh);
      window.clearInterval(poll);
      window.clearInterval(tick);
    };
  }, [revision]);

  const sessions = snapshot?.sessions ?? [];
  return (
    <section aria-labelledby="connected-users-title" style={{ marginBlock: 20 }}>
      <h2 id="connected-users-title">Connected users</h2>
      <p>Live connections to this server. Uptime measures the current connection and resets on reconnect.</p>
      <button type="button" style={btnGhost} onClick={() => setRevision(value => value + 1)}>Refresh connected users</button>
      {failed ? <p role="alert">Could not load connected users. Refresh to try again.</p>
        : !snapshot ? <p role="status">Loading connected users…</p>
        : !sessions.length ? <p>No connected users.</p>
        : <>
          <p>{new Set(sessions.map(session => session.userId)).size} connected accounts · {sessions.length} sessions</p>
          <div className="vd-table-wrap">
            <table className="tbl">
              <thead><tr><th scope="col">User</th><th scope="col">Roles</th><th scope="col">Logged in</th><th scope="col">Connected since</th><th scope="col">Uptime</th><th scope="col">Connections</th></tr></thead>
              <tbody>{sessions.map((session, index) => {
                const uptime = Math.max(0, Math.floor((snapshot.serverMs + clock - snapshot.receivedMs - Date.parse(session.connectedSince)) / 1000));
                return (
                  <tr key={`${session.userId}-${session.loggedInAt}-${index}`}>
                    <th scope="row">{session.name}<div>{session.email}</div></th>
                    <td>{session.roles.join(', ') || '—'}</td>
                    <td>{session.loggedInAt ? new Date(session.loggedInAt).toLocaleString() : '—'}</td>
                    <td>{new Date(session.connectedSince).toLocaleString()}</td>
                    <td>{duration(uptime)}</td>
                    <td>{session.connections}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        </>}
    </section>
  );
}
