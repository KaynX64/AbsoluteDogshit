import Icon from '../../shared/ui/Icon';
import './ServerConsole.css';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { API_BASE_URL } from '../../config/api';
import { btnGhost, inputStyle } from '../../theme';
import { useConfirmAction } from '../../shared/ui/ConfirmAction';

type Status = { instanceId: string; restartAuthorized: boolean; restartAvailable: boolean; restarting?: boolean; events: { at: string; message: string }[] };
const diagnostics = ['status', 'health', 'workers', 'memory'];

type SystemStatus = {
  overall: string; serverVersion: string; environment: string; cores: number | null; threads: number;
  ram: { totalBytes: number; availableBytes: number; usedBytes: number };
  uptimeSeconds: number; processUptimeSeconds: number;
  mysql: DependencyStatus; redis: DependencyStatus; minio: DependencyStatus;
};
type DependencyStatus = { status: string; version: string | null };

const gib = (bytes: number) => `${(bytes / 1073741824).toFixed(2)} GiB`;
function uptime(seconds: number) {
  return `${Math.floor(seconds / 86400)}d ${Math.floor(seconds / 3600) % 24}h ${Math.floor(seconds / 60) % 60}m ${seconds % 60}s`;
}

function formatStatus(status: SystemStatus) {
  const service = ({ status, version }: DependencyStatus) => status + ' · ' + (version ?? 'Version unavailable');
  return [
    ['Overall status', status.overall],
    ['Server version', status.serverVersion],
    ['Environment OS', status.environment],
    ['CPU cores', status.cores ?? 'Unavailable'],
    ['CPU threads', status.threads],
    ['RAM available', gib(status.ram.availableBytes)],
    ['RAM used', `${gib(status.ram.usedBytes)} / ${gib(status.ram.totalBytes)}`],
    ['System uptime', uptime(status.uptimeSeconds)],
    ['Server uptime', uptime(status.processUptimeSeconds)],
    ['MySQL', service(status.mysql)],
    ['Redis', service(status.redis)],
    ['MinIO', service(status.minio)],
  ].map(([label, value]) => String(label).padEnd(17) + value).join('\n');
}

async function request(path: string, signal: AbortSignal, body?: object) {
  const result = await fetch(`${API_BASE_URL}/api/admin/operations${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${localStorage.getItem('valetudo_token')}`, 'Content-Type': 'application/json' },
    signal: AbortSignal.any([signal, AbortSignal.timeout(12_000)]), body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await result.json().catch(() => ({}));
  if (!result.ok) throw Object.assign(new Error(payload.error || 'Server console unavailable.'), { status: result.status });
  return payload;
}

export default function ServerConsole() {
  const [status, setStatus] = useState<Status | null>(null);
  const [command, setCommand] = useState('');
  const [output, setOutput] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [denied, setDenied] = useState(false);
  const lifetime = useRef<AbortController | null>(null);
  const commandInput = useRef<HTMLInputElement>(null);
  const consoleOutput = useRef<HTMLPreElement>(null);
  const followOutput = useRef(true);
  const action = useRef<AbortController | null>(null);
  const accessRevision = useRef(0);
  const restartFrom = useRef<{ id: string; deadline: number } | null>(null);
  const { confirmAction, confirmation } = useConfirmAction();

  function clearAccess() {
    accessRevision.current++;
    action.current?.abort();
    action.current = null;
    setBusy(false);
    setCommand('');
    restartFrom.current = null;
    setStatus(null);
    setOutput([]);
    setDenied(true);
    setMessage('Server console access is unavailable.');
  }

  useEffect(() => {
    const panel = consoleOutput.current;
    if (panel && followOutput.current) panel.scrollTop = panel.scrollHeight;
  }, [status, output]);

  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    let refreshing = false;
    async function refresh() {
      if (refreshing || controller.signal.aborted) return;
      refreshing = true;
      const revision = accessRevision.current;
      try {
        const data: Status = await request('', controller.signal);
        if (controller.signal.aborted || revision !== accessRevision.current) return;
        if (typeof data.instanceId !== 'string' || !Array.isArray(data.events)) throw new Error('Invalid Terminal status.');
        setStatus(data);
        setDenied(false);
        const pending = restartFrom.current;
        if (pending && data.instanceId !== pending.id) {
          restartFrom.current = null;
          setBusy(false);
          setMessage('Server restarted and is ready.');
        } else if (!pending) {
          setMessage(current => current === 'Server is unreachable.' ? '' : current);
        }
      } catch (error) {
        if (controller.signal.aborted || revision !== accessRevision.current) return;
        if ((error as { status?: number }).status === 403 || (error as { status?: number }).status === 401) {
          clearAccess();
          setBusy(false);
        } else if (!restartFrom.current) {
          setStatus(null);
          setMessage('Server is unreachable.');
        } else {
          setStatus(null);
        }
      } finally {
        if (!controller.signal.aborted && restartFrom.current && Date.now() >= restartFrom.current.deadline) {
          restartFrom.current = null;
          setBusy(false);
          setMessage('Could not verify a restart. Check the server host.');
        }
        refreshing = false;
      }
    }
    void refresh();
    const timer = window.setInterval(refresh, 3000);
    return () => { controller.abort(); action.current?.abort(); window.clearInterval(timer); };
  }, []);

  async function execute(event: FormEvent) {
    event.preventDefault();
    commandInput.current?.focus({ preventScroll: true });
    const name = command.trim().toLowerCase();
    if (busy || action.current || !name) return;
    if (name === 'clear') { setOutput([]); setCommand(''); setMessage(''); followOutput.current = true; return; }
    if (name === 'help') { setOutput(lines => [...lines.slice(-19), '> help\n' + [...diagnostics, 'clear', 'help'].join(' · ')]); setCommand(''); return; }
    if (!diagnostics.includes(name)) { setMessage('Unknown command. Type help to list commands.'); return; }
    if (!status) { setMessage('Reconnect before running server diagnostics.'); return; }
    const controller = new AbortController();
    action.current = controller;
    const signal = controller.signal;
    followOutput.current = true;
    setBusy(true);
    setCommand('');
    setMessage('');
    try {
      const data = await request('/command', signal, { command: name });
      if (!signal.aborted) setOutput(lines => [...lines.slice(-19), '> ' + name + '\n' + (name === 'status' ? formatStatus(data.output) : JSON.stringify(data.output, null, 2))]);
    } catch (error) {
      if (signal.aborted) return;
      if ([401, 403].includes((error as { status?: number }).status ?? 0)) clearAccess();
      else setMessage((error as Error).message);
    } finally {
      if (action.current === controller) {
        action.current = null;
        setBusy(false);
      }
    }
  }

  async function restart() {
    if (!status?.restartAvailable || status.restarting || busy || action.current || !lifetime.current) return;
    const lifecycle = lifetime.current.signal;
    const revision = accessRevision.current;
    if (!await confirmAction('Restart server', 'Connected clients will briefly disconnect while the server drains requests and restarts.') ||
        lifecycle.aborted || revision !== accessRevision.current || action.current) return;
    const controller = new AbortController();
    action.current = controller;
    const signal = controller.signal;
    setBusy(true);
    const pending = { id: status.instanceId, deadline: Date.now() + 90_000 };
    restartFrom.current = pending;
    setMessage('Requesting restart…');
    try {
      await request('/restart', signal, {});
      if (!signal.aborted && restartFrom.current === pending) setMessage('Waiting for the server to restart…');
    } catch (error) {
      if (signal.aborted || restartFrom.current !== pending) return;
      if ([401, 403].includes((error as { status?: number }).status ?? 0)) clearAccess();
      else if ((error as { status?: number }).status) {
        restartFrom.current = null;
        setMessage((error as Error).message);
      } else {
        setMessage('Connection interrupted. Checking whether the server restarted…');
      }
      if (!restartFrom.current) setBusy(false);
    } finally {
      if (action.current === controller) action.current = null;
    }
  }

  return (
    <section className="server-console" data-workspace-view aria-labelledby="server-console-title">
      <header className="server-console-header">
        <div className="server-console-heading">
          <span className="server-console-icon"><Icon name="terminal" size={24} /></span>
          <div><h1 id="server-console-title">Terminal</h1><p>Server diagnostics and restart</p></div>
        </div>
        {!denied && status?.restartAuthorized && <button type="button" style={btnGhost} disabled={busy || !status.restartAvailable || status.restarting} onClick={() => void restart()}>
          <Icon name="restart_alt" size={17} /> Restart server
        </button>}
      </header>
      {!denied && <div className="server-console-surface">
        <div className="server-console-toolbar">
          <span>Server output</span>
          <span data-online={Boolean(status)}>{status ? 'Connected' : 'Disconnected'}</span>
        </div>
        <pre ref={consoleOutput} aria-label="Server events and command output" tabIndex={0}
          onScroll={event => {
            const panel = event.currentTarget;
            followOutput.current = panel.scrollHeight - panel.scrollTop - panel.clientHeight < 8;
          }}>
          {[...status?.events.map(event => new Date(event.at).toLocaleTimeString() + '  ' + event.message) ?? [], ...output].join('\n') || 'No server output yet.'}
        </pre>
        <form onSubmit={execute} className="server-console-prompt">
          <span aria-hidden="true">›</span>
          <input ref={commandInput} autoFocus aria-label="Diagnostic command" style={inputStyle} maxLength={32} spellCheck={false}
            value={command} onChange={event => setCommand(event.target.value)} placeholder="Type status or help" />
          <button type="submit" disabled={busy || !command.trim()}>Run</button>
        </form>
      </div>}
      {status?.restartAuthorized && !status.restartAvailable && <p>Remote restart requires the server to be started with npm start.</p>}
      {(message || status?.restarting) && <p role="status">{message || 'A server restart is in progress.'}</p>}
      {confirmation}
    </section>
  );
}
