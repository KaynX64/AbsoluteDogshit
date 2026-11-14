import { consoleNavigation } from './consoleNavigation';
import Icon from '../shared/ui/Icon';
import ThemedLogo from '../shared/ui/ThemedLogo';
import SettingsMenu from './SettingsMenu';

interface SidebarProps {
  role: string;
  onSignOut: () => void;
  onChangePassword: () => void;
  activeItem?: string;
  onItemClick?: (key: string) => void;
  badgeCounts?: Record<string, number>;
  showIncidentRecords: boolean;
}

export default function Sidebar({ role, onSignOut, onChangePassword, activeItem, onItemClick, badgeCounts, showIncidentRecords }: SidebarProps) {
  const navItems = consoleNavigation(role).filter(item => item.key !== 'incidents' || showIncidentRecords);

  return (
    <aside className="sb">
      <div className="sb-logo-block">
        <div className="sb-logo-lg">
          <ThemedLogo alt="LeoVital HealthLink" />
        </div>
        <div className="sb-brand-text">
          <span className="sb-brand-name">LeoVital</span>
          <span className="sb-brand-sub">HealthLink</span>
        </div>
      </div>
      <nav className="sb-nav" aria-label="Console navigation">
        {navItems.map((item) => {
          const isActive = activeItem === item.key;
          const badge = badgeCounts?.[item.key] ?? 0;
          return (
            <button
              key={item.key}
              type="button"
              className={`sb-item${isActive ? ' is-active' : ''}`}
              aria-current={isActive ? 'page' : undefined}
              onClick={() => onItemClick?.(item.key)}
              style={{ cursor: onItemClick ? 'pointer' : 'default', position: 'relative' }}
            >
              <Icon name={item.icon} size={20} />
              <span>{item.label}</span>
              {badge > 0 && (
                <span className="sb-badge">
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="sb-spacer" />

      <div className="sb-links">
        {/* Dedicated settings menu (bottom-left) — theme mode & presets,
            reset password, and per-account persistence state. */}
        <SettingsMenu onResetPassword={onChangePassword} />
        <button
          type="button"
          className="sb-link"
          onClick={onSignOut}
          title="Sign out"
        >
          <Icon name="logout" size={20} />
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  );
}
