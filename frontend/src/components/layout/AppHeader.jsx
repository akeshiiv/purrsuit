import { NavLink } from 'react-router';

import AccountButton from './AccountButton.jsx';
import TabIcon from './TabIcon.jsx';

// Seven tabs, in design order. `end` keeps Home from matching its children.
const TABS = [
  { to: '/realm', label: 'Home', icon: 'home', end: true },
  { to: '/realm/map', label: 'Map', icon: 'map' },
  { to: '/realm/study', label: 'Study', icon: 'study' },
  { to: '/realm/shop', label: 'Shop', icon: 'shop' },
  { to: '/realm/inventory', label: 'Cats', icon: 'cats' },
  { to: '/realm/leaderboard', label: 'Ranks', icon: 'ranks' },
  { to: '/realm/stats', label: 'Stats', icon: 'stats' },
];

function Tab({ tab }) {
  return (
    <NavLink
      className={({ isActive }) =>
        [
          'flex items-center gap-2 rounded-full px-[15px] py-2 transition-[filter] hover:brightness-[1.03]',
          isActive
            ? 'border-2 border-gold-edge bg-gold text-ink-body shadow-[0_3px_0_var(--color-gold-shadow)]'
            : 'border-2 border-transparent text-ink-muted',
        ].join(' ')
      }
      end={tab.end}
      to={tab.to}
    >
      <TabIcon name={tab.icon} />
      <span className="font-display text-[15px] font-extrabold">{tab.label}</span>
    </NavLink>
  );
}

/**
 * Shared chrome for every in-app screen: wordmark, tab bar, and a right-hand
 * context cluster that each screen fills with its own content, closed by the
 * account button.
 *
 * The account button is rendered here rather than passed in as `right`, because
 * every screen needs it and none of them should have to remember it — that is
 * exactly how /account ended up with no way in.
 */
export default function AppHeader({ children, tabs = true, className = '' }) {
  return (
    <header className={`flex items-center gap-[22px] px-[34px] pt-[18px] ${className}`}>
      <h1 className="font-display text-[28px] font-extrabold text-ink">Purrsuit</h1>
      {tabs ? (
        <nav className="flex gap-[6px] rounded-full border-3 border-edge-soft bg-track p-[6px] shadow-[0_4px_0_var(--color-warm)]">
          {TABS.map(tab => (
            <Tab key={tab.to} tab={tab} />
          ))}
        </nav>
      ) : null}
      <div className="ml-auto flex items-center gap-[10px]">
        {children}
        <AccountButton />
      </div>
    </header>
  );
}
