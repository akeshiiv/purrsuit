// The cozy hard-shadow button. Variants map 1:1 onto the design's CTA colours:
// gold = primary, blue = study / share-screen, danger = destructive.
const VARIANTS = {
  gold: 'p-btn-gold',
  blue: 'p-btn-blue',
  plain: 'p-btn-plain',
  white: 'p-btn-white',
  danger: 'p-btn-danger',
  'danger-ghost': 'p-btn-danger-ghost',
  // legacy aliases so older call sites keep working
  primary: 'p-btn-gold',
  secondary: 'p-btn-plain',
};

const SIZES = {
  sm: 'px-4 py-2 text-[15px]',
  md: 'px-5 py-3 text-[17px]',
  lg: 'px-6 py-[15px] text-[19px]',
  xl: 'px-7 py-4 text-[23px]',
};

export default function Button({
  children,
  className = '',
  type = 'button',
  variant = 'gold',
  size = 'md',
  full = false,
  ...props
}) {
  return (
    <button
      className={`p-btn ${VARIANTS[variant] ?? VARIANTS.gold} ${SIZES[size] ?? SIZES.md} ${full ? 'w-full' : ''} ${className}`}
      type={type}
      {...props}
    >
      {children}
    </button>
  );
}
