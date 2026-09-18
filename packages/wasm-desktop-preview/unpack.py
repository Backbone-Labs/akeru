"""Unpack verified local artifacts without extracting archive-controlled paths."""
import sys, pathlib, zipfile, tarfile, gzip, io, json
kind, directory = sys.argv[1:]
root = pathlib.Path(directory)
if kind == 'supertux':
    out = root / 'supertux'
    out.mkdir(exist_ok=True)
    with zipfile.ZipFile(root / 'supertux.zip') as archive:
        for name in ['supertux2.js', 'supertux2.wasm', 'supertux2.worker.js', 'supertux2.data']:
            (out / name).write_bytes(archive.read(name))
elif kind == 'supertuxkart':
    out = root / 'kart'
    chunks = [out / ('data_low.tar.gz.%02d' % i) for i in range(7)]
    data = gzip.decompress(b''.join(p.read_bytes() for p in chunks))
    files, output = [], bytearray()
    with tarfile.open(fileobj=io.BytesIO(data)) as archive:
        for member in archive:
            if not member.isfile():
                continue
            name = member.name.removeprefix('./')
            if name.startswith('/') or '..' in name.split('/'):
                raise ValueError('Unsafe archive member')
            content = archive.extractfile(member).read()
            files.append({'path': '/data/' + name, 'start': len(output), 'length': len(content)})
            output.extend(content)
    (out / 'game.data').write_bytes(output)
    (out / 'files.json').write_text(json.dumps(files))
else:
    raise ValueError('Unknown title')
