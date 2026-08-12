// The user's own drawings, background-removed and trimmed to content so they
// sit correctly inside circular containers. Rendered plainly — object-fit:
// contain with a little padding, no blend mode and no filter.
import alphasigma67 from '../assets/cats/alphasigma67.png';
import mastergooner from '../assets/cats/mastergooner.png';
import mrchonk from '../assets/cats/mrchonk.png';

export const CAT_ART = {
  A: mastergooner,
  B: alphasigma67,
  C: mrchonk,
};

export function catArt(unitType) {
  return CAT_ART[unitType] ?? mastergooner;
}
