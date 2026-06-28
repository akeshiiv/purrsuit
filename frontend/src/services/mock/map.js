import {
  actionsFor,
  bumpVersion,
  clone,
  getCell,
  isAdjacentToOwnedCell,
  mapMembersPayload,
  mePayload,
  mockError,
  state,
  unitBeats,
  unitKey,
} from './state.js';

function mapPayload(changed = true) {
  if (!changed) {
    return { version: state.season.stateVersion, changed: false };
  }

  return clone({
    version: state.season.stateVersion,
    changed: true,
    size: state.realm.mapSize,
    cells: state.cells,
    members: mapMembersPayload(),
    me: { ...state.me, actions: actionsFor() },
  });
}

export async function getMap(since) {
  if (Number(since) === state.season.stateVersion) {
    return mapPayload(false);
  }

  return mapPayload(true);
}

export async function attack(intent) {
  const target = getCell(Number(intent.x), Number(intent.y));
  const unitType = intent.unitType;
  const key = unitKey(unitType);
  const quantity = Number(intent.quantity);

  if (!target || target.type !== 'regular') {
    throw mockError('INVALID_TARGET', 'Target must be a regular cell.');
  }
  if (!isAdjacentToOwnedCell(target)) {
    throw mockError('NOT_ADJACENT', 'Target must be adjacent to owned territory.');
  }
  if (!key || state.me.units[key] < quantity) {
    throw mockError('INSUFFICIENT_UNITS', 'Not enough units for that attack.', 409);
  }

  state.me.units[key] -= quantity;
  let result = 'repelled';

  if (!target.ownerMemberId) {
    Object.assign(target, {
      ownerMemberId: state.me.id,
      colour: state.me.colour,
      unitType,
      troopCount: quantity,
    });
    result = 'claimed';
  } else if (unitBeats(unitType, target.unitType) && quantity >= target.troopCount) {
    Object.assign(target, {
      ownerMemberId: state.me.id,
      colour: state.me.colour,
      unitType,
      troopCount: Math.max(1, quantity - target.troopCount),
    });
    state.me.battlesWon += 1;
    result = 'captured';
  } else {
    target.troopCount = Math.max(1, target.troopCount - quantity);
  }

  bumpVersion();
  return clone({
    ok: true,
    result,
    cell: target,
    units: state.me.units,
  });
}

export async function defend(intent) {
  const target = getCell(Number(intent.x), Number(intent.y));
  const unitType = intent.unitType;
  const key = unitKey(unitType);

  if (!target || target.ownerMemberId !== state.me.id) {
    throw mockError('NOT_OWNER', 'You can only defend your own cells.', 403);
  }
  if (target.unitType !== unitType) {
    throw mockError('UNIT_TYPE_MISMATCH', 'The defending unit type must match the cell.');
  }
  if (!key || state.me.units[key] < 1) {
    throw mockError('INSUFFICIENT_UNITS', 'You do not have that unit.', 409);
  }

  state.me.units[key] -= 1;
  target.troopCount += 1;
  bumpVersion();

  return clone({
    ok: true,
    cell: target,
    units: state.me.units,
  });
}

export { mePayload };
