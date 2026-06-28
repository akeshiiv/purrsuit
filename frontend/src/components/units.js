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

export function beatsLabel(unitType) {
  return UNIT_META[UNIT_META[unitType].beats].name;
}
