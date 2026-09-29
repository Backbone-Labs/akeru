import { beginBuild } from '../arcade-preview/build.mjs';
const b = beginBuild('hexgl');
const scripts = [
  'libs/Three.dev.js',
  'libs/ShaderExtras.js',
  'libs/postprocessing/EffectComposer.js',
  'libs/postprocessing/RenderPass.js',
  'libs/postprocessing/BloomPass.js',
  'libs/postprocessing/ShaderPass.js',
  'libs/postprocessing/MaskPass.js',
  'bkcore.coffee/Timer.js',
  'bkcore.coffee/ImageData.js',
  'bkcore.coffee/Utils.js',
  'bkcore/threejs/RenderManager.js',
  'bkcore/threejs/Shaders.js',
  'bkcore/threejs/Particles.js',
  'bkcore/threejs/Loader.js',
  'bkcore/Audio.js',
  'bkcore/hexgl/HUD.js',
  'bkcore/hexgl/RaceData.js',
  'bkcore/hexgl/ShipControls.js',
  'bkcore/hexgl/ShipEffects.js',
  'bkcore/hexgl/CameraChase.js',
  'bkcore/hexgl/Gameplay.js',
  'bkcore/hexgl/tracks/Cityscape.js',
  'bkcore/hexgl/HexGL.js',
];
const flat = (p) => p.replaceAll('/', '__');
const chunks = scripts.map((p) => {
  let s = b.read(p).toString();
  if (p.endsWith('Cityscape.js'))
    s = s.replace(
      /(["'])(textures(?:\.full)?\/[^"']+|geometries\/[^"']+|audio\/[^"']+)\1/g,
      (_m, q, path) => q + flat(path) + q,
    );
  return s;
});
b.put('engine.js', chunks.join('\n;\n'));
for (const f of b.inventory.files.filter(
  (f) =>
    /^(textures\/|geometries\/|audio\/)/.test(f.path) &&
    /\.(png|jpg|js|ogg)$/.test(f.path) &&
    /^[a-zA-Z0-9._/-]+$/.test(f.path),
))
  b.put(flat(f.path), b.read(f.path));
b.put('UPSTREAM-LICENSE.txt', b.read('LICENSE'));
b.finish();
