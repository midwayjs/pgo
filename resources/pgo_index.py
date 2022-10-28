from index import initializer, handler


def gen_handler(environ, start_response):
    request_uri: str = environ['fc.request_uri']

    if '/pgo_dump' in request_uri:
        return dump_pgo(request_uri, start_response)

    return handler(environ, start_response)


def dump_pgo(uri: str, start_response):
    import subprocess, sys, os
    assert os.environ['PYCDSMODE'] == 'TRACE'
    lst = os.environ['PYCDSLIST']
    img = '/tmp/cds.img'

    if uri.endswith('/list'):
        status = '200 OK'
        response_headers = [('Content-type', 'text/plain')]
        start_response(status, response_headers)
        with open(lst) as r:
            return [r.read()]


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


    status = '200 OK'
    response_headers = [('Content-type', 'text/plain')]
    if uri.endswith('/size'):
        start_response(status, response_headers)
        return [f'size: {os.lstat(img).st_size}'.encode()]
    elif uri.endswith('/download'):
        response_headers = [('Content-type', 'application/octet-stream')]
        start_response(status, response_headers)
        with open(img, 'rb') as f:
            return [f.read()]
    else:
        start_response(status, response_headers)
        return [b'empty']
