// Host-owned initialization; unknown upstream atlas and borrowed hash helpers excluded.
let w = 910,
  h = 462,
  x = 0,
  y = 0,
  ntiles = 7,
  tileWidth = 128,
  tileHeight = 64,
  tool = [0, 1],
  isPlacing = false,
  map,
  bg,
  cf,
  texture;
let changed = false;
const updateHashState = () => {
  changed = true;
};
