"""Derive a smaller mobile asset set; preserve rights/source records and input files.
Run with Pillow 11.3.0, soundfile 0.13.1, scipy 1.16.2.
Usage: python optimize-assets.py REVIEWED_SOURCE NEW_OUTPUT
"""
import hashlib
import json
import math
import pathlib
import shutil
import sys

from PIL import Image, UnidentifiedImageError
import soundfile as sf
from scipy.signal import resample_poly

source, output = map(pathlib.Path, sys.argv[1:])
if output.exists():
    raise SystemExit('Output must be a new directory')
shutil.copytree(source, output)
manifest = json.loads((output / 'release-manifest.json').read_text())
changes = []
for entry in manifest['files']:
    path = output / entry['path']
    change = None
    # Keep UI/font atlases pixel-identical: their layouts rely on exact dimensions.
    if path.suffix.lower() in ('.png', '.jpg', '.jpeg') and not any(
        part in ('fonts', 'textures', 'maps') for part in pathlib.Path(entry['path']).parts
    ):
        try:
            opened = Image.open(path)
        except UnidentifiedImageError:
            # Preserve uncommon source PNGs rather than damaging their bytes.
            continue
        with opened as image:
            if max(image.size) > 512:
                old = image.size
                size = tuple(max(1, round(n * 512 / max(old))) for n in old)
                resized = image.resize(size, Image.Resampling.LANCZOS)
                resized.save(path)
                change = f'Mobile texture resized from {old} to {size}; original source/license retained'
    elif path.suffix.lower() == '.wav':
        samples, rate = sf.read(path, dtype='float32', always_2d=True)
        if rate > 22050:
            divisor = math.gcd(rate, 22050)
            samples = resample_poly(samples, 22050 // divisor, rate // divisor, axis=0)
            sf.write(path, samples, 22050, subtype='PCM_16')
            change = f'PCM sound resampled from {rate} to 22050 Hz with antialias filtering; channels retained'
    if change:
        before = entry['sha256']
        entry['sha256'] = hashlib.sha256(path.read_bytes()).hexdigest()
        entry['bytes'] = path.stat().st_size
        entry['startupOptimization'] = change
        changes.append({'path': entry['path'], 'inputSha256': before, 'sha256': entry['sha256'], 'change': change})
(output / 'release-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
(output / 'startup-optimizations.json').write_text(json.dumps(changes, indent=2) + '\n')
with (output / 'CREDITS.md').open('a') as f:
    f.write('\nBrowser startup optimization: world/model textures capped at 512 pixels; high-rate PCM effects resampled to 22.05 kHz with channels preserved. UI/font atlases remain unchanged. These modifications retain the source asset licenses and attribution above. Per-file changes are recorded in release-manifest.json.\n')
print(json.dumps({'modified': len(changes), 'sourceBytes': sum(p.stat().st_size for p in (source/'data').rglob('*') if p.is_file()), 'outputBytes': sum(p.stat().st_size for p in (output/'data').rglob('*') if p.is_file())}))
