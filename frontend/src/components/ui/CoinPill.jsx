// Coin balance — the right cluster's default. Baloo 2 17px with a gold coin dot.
export default function CoinPill({ coins, className = '' }) {
  return (
    <div className={`p-pill py-[7px] pr-[14px] pl-2 ${className}`}>
      <span
        aria-hidden="true"
        className="block size-[22px] rounded-full border-2 border-[#C08D45] bg-linear-to-b from-gold-pale to-gold-deep"
      />
      <span className="p-nums text-[17px] text-gold-ink">{coins ?? 0}</span>
    </div>
  );
}
