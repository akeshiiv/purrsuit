// `hero` = 4px border + 0 12px 0 shadow (sign-in, realm select, season end).
// `card` = the everyday 3px card. `panel` = large docked panel (attack panel).
const VARIANTS = {
  card: 'p-card',
  hero: 'p-card-hero',
  panel: 'p-panel',
  tile: 'p-tile',
};

export default function Card({ children, className = '', variant = 'card', as: Tag = 'section', ...props }) {
  return (
    <Tag className={`${VARIANTS[variant] ?? VARIANTS.card} ${className}`} {...props}>
      {children}
    </Tag>
  );
}
