// Identity colours: the same hex marks the player's cells, avatar ring and
// legend chip everywhere, so the choice is a fixed set rather than a colour box.
// Onboarding and Settings pick from this one list — a colour offered in one and
// not the other would strand a player on a hex the picker can't show back.
//
// The onboarding handoff lists the sixth swatch as #eab308 (yellow); we keep the
// app's #ec4899 (pink). That handoff asks for these to stay in sync with the
// board palette, and pink is what the board, the ranks legend and --player-pink
// already use — yellow would also read as the gold UI chrome sitting on top of
// the map.
export const PLAYER_COLOURS = [
  { value: '#3b82f6', name: 'Blue' },
  { value: '#ef4444', name: 'Red' },
  { value: '#22c55e', name: 'Green' },
  { value: '#a855f7', name: 'Purple' },
  { value: '#f97316', name: 'Orange' },
  { value: '#ec4899', name: 'Pink' },
];

export const DEFAULT_PLAYER_COLOUR = '#3b82f6';
