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
    with open(os.path.join(HERE, 'manifest.json'), 'w', encoding='utf-8', newline='') as f:
        json.dump(manifest, f, indent=1)
    markup = open(os.path.join(HERE, '_markup.html'), encoding='utf-8').read()
    css = open(os.path.join(HERE, 'css/app.css'), encoding='utf-8').read()

    parts = []
    for path in manifest:
        full = os.path.join(HERE, path)
        if not os.path.exists(full):
            sys.exit(f"missing source: {path}")
        src = open(full, encoding='utf-8').read()
        # Belt and braces: strip any CR that crept in from a Windows editor.
        src = src.replace('\r\n', '\n').replace('\r', '\n')
        parts.append(f"/* ---- {os.path.basename(path)} ---- */\n" + src.rstrip())

    js = "\n\n".join(parts)
    out = markup.replace('@@CSS@@', '<style>\n' + css.rstrip() + '\n</style>')
    out = out.replace('@@JS@@', '<script>\n' + js + '\n</script>')

    # newline='' stops Python's text mode translating \n to \r\n on Windows,
    # which would otherwise make the built file differ by platform.
    dest = os.path.join(HERE, 'scenewright.html')
    with open(dest, 'w', encoding='utf-8', newline='') as f:
        f.write(out)

    print(f"built scenewright.html  {len(out):,} bytes")
    print(f"  {len(manifest)} modules, {len(js):,} bytes js, {len(css):,} bytes css")

if __name__ == '__main__':
    main()
