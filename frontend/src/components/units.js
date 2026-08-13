// Cat Unit metadata shared by the Shop and Inventory screens.
// Rock-paper-scissors: A beats B, B beats C, C beats A (see docs/api-contract.md).
export const UNIT_ORDER = ['A', 'B', 'C'];

export const UNIT_META = {
  A: { key: 'a', name: 'MasterGooner', beats: 'B' },
  B: { key: 'b', name: 'AlphaSigma67', beats: 'C' },
  C: { key: 'c', name: 'Mr.Chonk', beats: 'A' },
};

export const UNIT_COST = 100;
export const MAX_UNITS = 6;

// Coins earned per minute studied. The server is authoritative (backend/src/
// coins.js owns the same number) — this is only for the screens that quote the
// reward before it has been earned, and for the mock's stand-in economy. It
// lives beside the other economy constants because the literal 4 was written
// out in five places across three files, so a rate change would have had to find
// all of them.
export const COINS_PER_MINUTE = 4;

export function beatsLabel(unitType) {
  return UNIT_META[UNIT_META[unitType].beats].name;
}
