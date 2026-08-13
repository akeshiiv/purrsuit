import { NavLink } from 'react-router';

import { useAuth } from '../AuthContext.jsx';
import PlayerAvatar from '../settings/PlayerAvatar.jsx';

/**
 * The way into /account, and the only one — the tab bar covers the seven realm
 * screens and stops there, so without this the profile editor is reachable by
 * typed URL alone.
 *
 * Lives at the end of the header's right cluster on every in-app screen, after
 * whatever context that screen supplies. Styled like a tab rather than like a
 * `p-pill`: it is navigation, so it goes gold when it is the current screen and
 * sits quiet otherwise.
 */
export default function AccountButton() {
  const { profile } = useAuth();

  return (
    <NavLink
      aria-label="Account settings"
      className={({ isActive }) =>
        [
          'flex items-center gap-[10px] rounded-full border-3 py-[6px] pr-4 pl-[6px] transition-[filter] hover:brightness-[1.03]',
          isActive
            ? 'border-gold-edge bg-gold text-ink-body shadow-[0_3px_0_var(--color-gold-shadow)]'
            : 'border-edge-soft bg-surface text-ink-muted shadow-[0_3px_0_var(--color-warm)]',
        ].join(' ')
      }
      to="/account"
    >
      {({ isActive }) => (
        <>
          <PlayerAvatar
            colour={isActive ? '#C08D45' : profile?.colour}
            seed={profile?.id}
            size={30}
            src={profile?.avatarUrl ?? ''}
            well={isActive ? '#FFF8EA' : undefined}
          />
          <span className="font-display text-[15px] font-extrabold">Account</span>
        </>
      )}
    </NavLink>
  );
}
