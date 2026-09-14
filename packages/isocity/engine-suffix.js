window.IsoCity = {
  start(atlas, state) {
    texture = atlas;
    map =
      state?.map ??
      Array.from({ length: 7 }, () => Array.from({ length: 7 }, () => [0, 0]));
    bg = document.querySelector('#bg').getContext('2d');
    cf = document.querySelector('#fg').getContext('2d');
    bg.translate(w / 2, 128);
    cf.translate(w / 2, 128);
    drawMap();
  },
  select(id) {
    tool = [0, id];
  },
  place(row, column, erase = false) {
    click({
      offsetX: w / 2 + (column - row) * 64,
      offsetY: 128 + (row + column) * 32 + 32,
      which: erase ? 3 : 1,
    });
    isPlacing = false;
  },
  hover(row, column) {
    viz({
      offsetX: w / 2 + (column - row) * 64,
      offsetY: 128 + (row + column) * 32 + 32,
    });
  },
  pointer(e) {
    click(e);
    isPlacing = false;
  },
  serialize() {
    return { map };
  },
  dirty() {
    const result = changed;
    changed = false;
    return result;
  },
};
