interface TopBarProps {
  user: any;
  role: string;
  isOnline: boolean;
  offlineQueueCount: number;
  isReplaying: boolean;
  onManualReplay: () => void;
  roleView: string;
  roles: string[];
  onChangeRoleView: (v: string) => void;
}

export default function TopBar({
  user, role, isOnline, offlineQueueCount, isReplaying, onManualReplay,
  roleView, roles, onChangeRoleView,
}: TopBarProps) {
  const initials =
    `${(user.first_name?.[0] ?? '').toUpperCase()}${(user.last_name?.[0] ?? '').toUpperCase()}` || 'DA';

  // Dynamic greeting — computed on every render
  const hour = new Date().getHours();
  const greeting =
    hour >= 5 && hour < 12 ? 'Good morning'
    : hour >= 12 && hour < 18 ? 'Good afternoon'
    : 'Good evening';

  // Format current time in PHT for the sync-status pill
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-PH', {
    hour: '2-digit', minute: '2-digit', hour12: true,
    timeZone: 'Asia/Shanghai',
  });

  return (
    <header className="tb">
      <div className="tb-left">
        <div className="tb-eyebrow">LeoVital HealthLink Console</div>
        <h1 className="tb-greeting">{greeting}, {user.first_name}</h1>
      </div>

      <div className="tb-right">
        {roles.length > 1 && (
          <select
            className="tb-role-select"
            value={roleView}
            onChange={(e) => onChangeRoleView(e.target.value)}
          >
            {roles.map((r: string) => (
              <option key={r} value={r}>View as {r}</option>
            ))}
          </select>
        )}

        <span className={`tb-online ${isOnline ? 'is-on' : 'is-off'}`}>
          <span style={{ fontSize: 8 }}>●</span>
          {isOnline ? `Connected · ${timeStr}` : 'Offline'}
        </span>

        {offlineQueueCount > 0 && (
          <button
            type="button"
            className="tb-replay"
            onClick={onManualReplay}
            disabled={isReplaying}
          >
            {isReplaying ? 'Syncing…' : `${offlineQueueCount} queued`}
          </button>
        )}

        <span className="tb-role-pill">{role}</span>

        <div className="tb-user-chip">
          <div className="tb-avatar">{initials}</div>
          <div>
            <div className="tb-user-name">{user.first_name} {user.last_name}</div>
            <div className="tb-user-email">{user.email}</div>
          </div>
        </div>
      </div>
    </header>
  );
}
