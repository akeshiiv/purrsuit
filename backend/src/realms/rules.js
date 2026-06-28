import { randomInt } from 'node:crypto';
import { MAP_PRESETS } from '../map/presets.js';

const JOIN_CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export function totalUnits(member) {
  return (
    Number(member.unitsA ?? member.units_a ?? member.units?.a ?? 0)
    + Number(member.unitsB ?? member.units_b ?? member.units?.b ?? 0)
    + Number(member.unitsC ?? member.units_c ?? member.units?.c ?? 0)
  );
}

export function computeActions(member) {
  const total = totalUnits(member);
  const canBuy = Number(member.coins ?? 0) >= 100 && total < 6;

  return {
    canStudy: Number(member.coins ?? 0) < 100,
    canBuy,
    mustBuy: canBuy,
    canDeploy: total >= 1,
  };
}

export function generateJoinCode() {
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += JOIN_CODE_ALPHABET[randomInt(JOIN_CODE_ALPHABET.length)];
  }
  return code;
}

export function releaseTerritoryFromCells(cells, memberId) {
  return cells.map((cell) => {
    if (cell.ownerMemberId !== memberId) return { ...cell };
    return {
      ...cell,
      type: cell.type === 'home' ? 'regular' : cell.type,
      ownerMemberId: null,
      unitType: null,
      troopCount: 0,
    };
  });
}

export function normalizeRealmSettings(input = {}) {
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const mapPreset = input.mapPreset;
  const maxPlayers = Number(input.maxPlayers);
  const seasonLengthDays = Number(input.seasonLengthDays);
  const antiCheat = input.antiCheat ?? false;

  if (
    name.length < 1
    || name.length > 64
    || !MAP_PRESETS.has(mapPreset)
    || !Number.isInteger(maxPlayers)
    || maxPlayers < 2
    || maxPlayers > 10
    || !Number.isInteger(seasonLengthDays)
    || seasonLengthDays < 7
    || seasonLengthDays > 366
    || typeof antiCheat !== 'boolean'
  ) {
    return { ok: false, error: 'INVALID_REALM_SETTINGS' };
  }

  return {
    ok: true,
    settings: {
      name,
      mapPreset,
      maxPlayers,
      seasonLengthDays,
      antiCheat,
    },
  };
}
