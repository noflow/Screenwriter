#!/usr/bin/env python3
"""Bundles the split sources back into one self-contained scenewright.html.

    python build.py

Concatenates js/ in filename order (which is load order) and inlines css/app.css,
so the output behaves identically to the modular version but is a single file you
can move around without breaking it.
"""
import json, os, sys, re

HERE = os.path.dirname(os.path.abspath(__file__))

def main():
    # Rebuild the manifest from the directory so a new module is picked up
    # just by dropping it in, named for where it should load.
    names = sorted(f for f in os.listdir(os.path.join(HERE, 'js')) if f.endswith('.js'))
    manifest = ['js/' + n for n in names]
    json.dump(manifest, open(os.path.join(HERE, 'manifest.json'), 'w'), indent=1)
    markup = open(os.path.join(HERE, '_markup.html')).read()
    css = open(os.path.join(HERE, 'css/app.css')).read()

    parts = []
    for path in manifest:
        full = os.path.join(HERE, path)
        if not os.path.exists(full):
            sys.exit(f"missing source: {path}")
        parts.append(f"/* ---- {os.path.basename(path)} ---- */\n" + open(full).read().rstrip())

    js = "\n\n".join(parts)
    out = markup.replace('@@CSS@@', '<style>\n' + css.rstrip() + '\n</style>')
    out = out.replace('@@JS@@', '<script>\n' + js + '\n</script>')

    dest = os.path.join(HERE, 'scenewright.html')
    open(dest, 'w').write(out)

    print(f"built scenewright.html  {len(out):,} bytes")
    print(f"  {len(manifest)} modules, {len(js):,} bytes js, {len(css):,} bytes css")

if __name__ == '__main__':
    main()
