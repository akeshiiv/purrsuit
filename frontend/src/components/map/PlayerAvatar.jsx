import CatCircle from '../ui/CatCircle.jsx';

/**
 * A player's portrait ringed in their identity colour — the same hex that marks
 * their cells and their legend chip. Members carry no artwork of their own, so
 * the caller passes the cat they hold most of.
 */
export default function PlayerAvatar({ unitType = 'A', colour, size = 30, ring = 2, padding = 2, title }) {
  return (
    <span
      className="flex-none rounded-full"
      style={{ border: `${ring}px solid ${colour ?? 'var(--color-edge)'}` }}
      title={title}
    >
      <CatCircle alt="" border={0} padding={padding} size={size - ring * 2} unitType={unitType} />
    </span>
  );
}
