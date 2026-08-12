import AppHeader from './AppHeader.jsx';

/**
 * One in-app screen: shared chrome on top, the screen's own body below.
 *
 * `right` is the header's context cluster, which varies per screen — coins on
 * most, the player legend on Map, a season countdown on Ranks, and so on.
 */
export default function Screen({ children, right = null, tabs = true, bodyClassName = '', className = '' }) {
  return (
    <div className={`flex min-h-screen flex-col bg-page text-ink-body ${className}`}>
      <AppHeader tabs={tabs}>{right}</AppHeader>
      <main className={`flex-1 px-[34px] pt-[22px] pb-[34px] ${bodyClassName}`}>{children}</main>
    </div>
  );
}
