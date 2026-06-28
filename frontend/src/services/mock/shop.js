import {
  actionsFor,
  bumpVersion,
  clone,
  mockError,
  state,
  totalUnits,
  unitKey,
} from './state.js';

export async function buy(unitType) {
  const payload = typeof unitType === 'object' ? unitType : { unitType };
  const key = unitKey(payload.unitType);

  if (!key) {
    throw mockError('INVALID_UNIT_TYPE', 'Choose unit type A, B, or C.');
  }
  if (state.me.coins < 100) {
    throw mockError('INSUFFICIENT_FUNDS', 'You need 100 coins to buy a unit.', 409);
  }
  if (totalUnits() >= 6) {
    throw mockError('INVENTORY_FULL', 'Inventory is already full.', 409);
  }

  state.me.coins -= 100;
  state.me.units[key] += 1;
  bumpVersion();

  return clone({
    coins: state.me.coins,
    units: state.me.units,
    actions: actionsFor(),
  });
}

export async function getInventory() {
  return clone({
    coins: state.me.coins,
    units: state.me.units,
    total: totalUnits(),
    actions: actionsFor(),
  });
}
