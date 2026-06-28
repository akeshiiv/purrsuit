import { bumpVersion, clone, profilePayload, state } from './state.js';

export async function get() {
  return profilePayload();
}

export async function update(profile) {
  state.profile = { ...state.profile, ...profile };
  state.me.name = state.profile.name;
  state.me.colour = state.profile.colour;
  state.cells
    .filter(cell => cell.ownerMemberId === state.me.id)
    .forEach(cell => {
      cell.colour = state.profile.colour;
    });
  bumpVersion();

  return clone({ ...state.profile, realm: state.realm });
}
