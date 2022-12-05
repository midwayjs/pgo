import json


def gen_handler(event, context):
    event = json.loads(event)
    img = dump_pgo()
    if event.get('type') == 'size':
        return len(img)
    else:
        import base64
        start, size = event['start'], event['size']
        return base64.b64encode(img[start:start + size])


def dump_pgo() -> bytes:
    import subprocess, sys, os
    assert os.environ['PYCDSMODE'] == 'TRACE'
    lst = os.environ['PYCDSLIST']
    img = '/tmp/cds.img'

    if not os.path.exists(img):
        with open(lst) as r:
            with open('/tmp/cds2.lst', 'w') as w:
                w.writelines([l for l in r.readlines() if not l.startswith('pgo_index')])

        subprocess.run([
            sys.executable, '-c',
            'import cds.dump; cds.dump.run_dump("/tmp/cds2.lst", "/tmp/cds.img")'], env={
            **os.environ,
            'PYCDSMODE': 'DUMP',
        })

    with open(img, 'rb') as f:
        return f.read()
