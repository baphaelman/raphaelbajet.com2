"""An AI-rticle as one file that opens from disk, for the render tools: its HTML from public/slop/play, with the
installed slop-editor's slop.css and slop.js (node_modules) inlined where the page links them.

    sys.path.insert(0, '..'); from page import page; s = page('comma-pump')
"""
from pathlib import Path

SITE = Path(__file__).resolve().parent.parent  # vite-project
PACKAGE = SITE / 'node_modules/slop-editor'


def inline(code):
    # "</script" or "</style" inside the code would end the element early
    return code.replace('</script', '<\\/script').replace('</style', '<\\/style')


def page(name):
    s = (SITE / f'public/slop/play/{name}.html').read_text()
    css = '<link rel="stylesheet" href="/slop/slop.css">'
    js = '<script src="/slop/slop.js"></script>'
    assert s.count(css) == 1 and s.count(js) == 1, f'{name}.html should link /slop/slop.css and /slop/slop.js once'
    s = s.replace(css, '<style id="slop-css">\n' + inline((PACKAGE / 'slop.css').read_text()) + '\n</style>')
    return s.replace(js, '<script id="slop-js">\n' + inline((PACKAGE / 'slop.js').read_text()) + '\n</script>')


if __name__ == '__main__':
    # python3 articles/page.py single-cycles > /tmp/single-cycles.html: one file to open from disk, or to publish
    import sys
    sys.stdout.write(page(sys.argv[1]))
