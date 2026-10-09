// Keep arena dimensions match-owned: multiple rooms can use different sizes in
// the same server process without changing shared tuning or other rooms.
export function patchFieldSize(path, source) {
  let code = source;
  const replace = (from, to) => {
    if (!code.includes(from))
      throw Error(`Field-size patch mismatch in ${path}: ${from}`);
    code = code.replace(from, to);
  };
  if (path === 'shared/constants.js') {
    code += `\nconst LARGE_FIELD = Object.freeze({...FIELD, halfLength:40, halfWidth:25});
Object.freeze(FIELD);
export function fieldForSettings(settings) {
  return settings?.fieldSize === 'large' ? LARGE_FIELD : FIELD;
}\n`;
    replace(
      'export const MATCH_DEFAULTS = {',
      "export const MATCH_DEFAULTS = {\n  fieldSize: 'standard',",
    );
  }
  if (path === 'shared/protocol.js') {
    replace(
      '    penalties: s.bots',
      "    fieldSize: s.fieldSize === 'large' ? 'large' : 'standard',\n    penalties: s.bots",
    );
  }
  if (path === 'shared/sim/world.js') {
    code = "import {fieldForSettings} from '../constants.js';\n" + code;
    replace(
      '    settings,',
      '    settings,\n    field: fieldForSettings(settings),',
    );
    replace(
      '  const world = {',
      "  settings.fieldSize = settings.fieldSize === 'large' ? 'large' : 'standard';\n  const world = {",
    );
    replace(
      '    p.x = -d * u;',
      '    if(p.slot !== 0 && !(p.team === team && (p.slot === 3 || p.slot === 4))) {u *= world.field.halfLength/30; w *= world.field.halfWidth/19;}\n    p.x = -d * u;',
    );
    replace(
      'collideWalls(p, R, 0.45, true)',
      'collideWalls(p, R, 0.45, true, world.field)',
    );
    code = code
      .replaceAll('collideBallArena(b)', 'collideBallArena(b, world.field)')
      .replaceAll(
        'collideBallArena(world.ball)',
        'collideBallArena(world.ball, world.field)',
      )
      .replaceAll(
        'goalCrossed(world.ball)',
        'goalCrossed(world.ball, world.field)',
      );
  }
  if (
    [
      'shared/sim/world.js',
      'shared/sim/ai.js',
      'shared/sim/pk.js',
      'shared/sim/actions.js',
    ].includes(path)
  ) {
    code = code
      .replace(/^const [LW] = FIELD\.(?:halfLength|halfWidth);\n/gm, '')
      .replace(/\bL\b/g, 'world.field.halfLength')
      .replace(/\bW\b/g, 'world.field.halfWidth')
      .replaceAll('FIELD.', 'world.field.');
    if (path === 'shared/sim/pk.js')
      code = code.replaceAll('goalCrossed(b)', 'goalCrossed(b, world.field)');
  }
  if (path === 'shared/sim/arena.js') {
    code = code.replace(/^const (L|W|C|GW|GH|GD) = FIELD\.[a-zA-Z]+;\n/gm, '');
    replace('ends = true)', 'ends = true, field = FIELD)');
    replace('collideBallArena(b) {', 'collideBallArena(b, field = FIELD) {');
    replace('goalCrossed(b) {', 'goalCrossed(b, field = FIELD) {');
    replace(
      'collideWalls(b, r, BALL.wallBounce, false)',
      'collideWalls(b, r, BALL.wallBounce, false, field)',
    );
    const dims = {
      L: 'halfLength',
      W: 'halfWidth',
      C: 'cornerCut',
      GW: 'goalHalfWidth',
      GH: 'goalHeight',
      GD: 'goalDepth',
    };
    for (const [name, prop] of Object.entries(dims))
      code = code.replace(new RegExp(`\\b${name}\\b`, 'g'), `field.${prop}`);
  }
  if (path === 'client/game/sessions.js')
    replace(
      'pk: null, settings: world.settings',
      'pk: null, field: world.field, settings: world.settings',
    );
  if (path === 'client/net/connection.js')
    replace('v: PROTOCOL, name', 'v: PROTOCOL, fieldSizes: true, name');
  if (path === 'client/storage.js') {
    replace('last: { minutes:', "last: { fieldSize: 'standard', minutes:");
    replace(
      '  out.last.penalties',
      "  out.last.fieldSize = l.fieldSize === 'large' ? 'large' : 'standard';\n  out.last.penalties",
    );
  }
  if (path === 'client/game/app.js') {
    code = "import {fieldForSettings} from '../shared/constants.js';\n" + code;
    replace(
      "      optionRow('CPU SKILL'",
      "      optionRow('FIELD SIZE', ['STANDARD', 'LARGE'], opts.fieldSize === 'large' ? 1 : 0, i => {opts.fieldSize = i === 1 ? 'large' : 'standard';}),\n      optionRow('CPU SKILL'",
    );
    replace(
      'this.renderer.setStadium(settings.stadium | 0);',
      'this.renderer.setStadium(settings.stadium | 0, fieldForSettings(settings));',
    );
    replace(
      '    this.demo?.dispose();\n    const seed',
      '    this.demo?.dispose();\n    this.renderer.setStadium(this.renderer.stadiumIndex, FIELD);\n    const seed',
    );
    replace(
      'x / FIELD.halfLength',
      'x / (this.session?.world.field.halfLength || FIELD.halfLength)',
    );
  }
  if (path === 'client/render/stadium.js') {
    replace(
      'const L = FIELD.halfLength, W = FIELD.halfWidth, C = FIELD.cornerCut;\n',
      '',
    );
    // Goal sizes are unchanged. Only pitch dimensions and placement vary.
    replace('function boardSegments() {', 'function boardSegments(field) {');
    const start = code.indexOf('function boardSegments'),
      end = code.indexOf('export class Stadium');
    const board = code
      .slice(start, end)
      .replace(/\bL\b/g, 'field.halfLength')
      .replace(/\bW\b/g, 'field.halfWidth')
      .replace(/\bC\b/g, 'field.cornerCut');
    code = code.slice(0, start) + board + code.slice(end);
    replace(
      'constructor(themeIndex, quality, renderer) {',
      'constructor(themeIndex, quality, renderer, field = FIELD) {\n    this.field = field;',
    );
    code = code
      .replace(/\bL\b/g, 'this.field.halfLength')
      .replace(/\bW\b/g, 'this.field.halfWidth')
      .replace(/\bC\b/g, 'this.field.cornerCut');
    replace('boardSegments()', 'boardSegments(this.field)');
    replace(
      'pitchTexture(t, maxAniso)',
      'pitchTexture(t, maxAniso, this.field)',
    );
    replace(
      'sc.left = -38; sc.right = 38; sc.top = 28; sc.bottom = -28;',
      'sc.left = -field.halfLength-8; sc.right = field.halfLength+8; sc.top = field.halfWidth+9; sc.bottom = -field.halfWidth-9;',
    );
  }
  if (path === 'client/render/textures.js') {
    replace(
      'pitchTexture(theme, maxAniso) {',
      'pitchTexture(theme, maxAniso, field = FIELD) {',
    );
    code = code.replaceAll('FIELD.', 'field.');
  }
  if (path === 'client/render/renderer.js') {
    replace('const L = FIELD.halfLength;\n', '');
    replace('setStadium(i) {', 'setStadium(i, field = this.field || FIELD) {');
    replace(
      'if (i === this.stadiumIndex) return;',
      'if (i === this.stadiumIndex && field === this.field) return;\n    this.field = field;\n    this.followingMatch = false;',
    );
    replace(
      'new Stadium(i, this.quality, this.gl)',
      'new Stadium(i, this.quality, this.gl, field)',
    );
    code = code.replace(/\bL\b/g, 'this.field.halfLength');
  }
  if (path === 'client/ui/hud.js')
    replace(
      '  _minimap(state) {',
      '  _minimap(state) {\n    const FIELD = state.field || {halfLength:30,halfWidth:19,goalHalfWidth:4.4};',
    );
  return code;
}
