#!/usr/bin/env python3
"""Bundles the split sources back into one self-contained scenewright.html.

    python build.py

Concatenates js/ in filename order (which is load order) and inlines css/app.css,
so the output behaves identically to the modular version but is a single file you
can move around without breaking it.
"""
import hashlib, json, os, sys, re

HERE = os.path.dirname(os.path.abspath(__file__))

LOCATION_MODULE = os.path.join(HERE, 'js', '02a-game-locations.js')
CHARACTER_MODULE = os.path.join(HERE, 'js', '01a-game-characters.js')

def game_location_source():
    """Find the canonical registry when the game and tool share a workspace.

    SCENEWRIGHT_GAME_LOCATIONS keeps the build portable when the repositories are
    checked out somewhere other than as siblings.
    """
    configured = os.environ.get('SCENEWRIGHT_GAME_LOCATIONS', '').strip()
    candidates = [configured] if configured else []
    candidates.append(os.path.abspath(os.path.join(
        HERE, '..', 'testgodot', 'content', 'world', 'all_locations.json')))
    return next((path for path in candidates if path and os.path.isfile(path)), None)

def sync_game_locations():
    """Refresh the checked-in browser module from the game's source of truth."""
    source = game_location_source()
    if not source:
        if not os.path.isfile(LOCATION_MODULE):
            sys.exit('missing js/02a-game-locations.js and no game location registry was found')
        return None

    with open(source, encoding='utf-8') as f:
        package = json.load(f)
    if not isinstance(package.get('locations'), list) or not isinstance(package.get('districts'), list):
        sys.exit(f'invalid game location registry: {source}')

    compact = json.dumps(package, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
    signature = hashlib.sha256(compact.encode('utf-8')).hexdigest()[:16]
    generated = (
        '/* Generated from testgodot/content/world/all_locations.json by build.py.\n'
        '   Edit the game registry, not this snapshot. */\n'
        f"const BUNDLED_LOCATION_SIGNATURE='{signature}';\n"
        f'const BUNDLED_LOCATION_PACKAGE={compact};\n'
    )
    previous = None
    if os.path.isfile(LOCATION_MODULE):
        with open(LOCATION_MODULE, encoding='utf-8') as f:
            previous = f.read()
    if previous != generated:
        with open(LOCATION_MODULE, 'w', encoding='utf-8', newline='') as f:
            f.write(generated)
    rooms = sum(len(location.get('rooms') or []) for location in package['locations'])
    return len(package['locations']), rooms, len(package['districts'])

def game_character_source():
    """Find the canonical Port Alder character-sheet directory."""
    configured = os.environ.get('SCENEWRIGHT_GAME_CHARACTERS', '').strip()
    candidates = [configured] if configured else []
    candidates.append(os.path.abspath(os.path.join(HERE, '..', 'testgodot', 'characters')))
    return next((path for path in candidates if path and os.path.isdir(path)), None)

def sync_game_characters():
    """Refresh the checked-in browser snapshot from the game's .character files."""
    source = game_character_source()
    if not source:
        if not os.path.isfile(CHARACTER_MODULE):
            sys.exit('missing js/01a-game-characters.js and no game character directory was found')
        return None

    filenames = sorted(name for name in os.listdir(source) if name.endswith('.character'))
    sheets = []
    seen = set()
    for filename in filenames:
        path = os.path.join(source, filename)
        with open(path, encoding='utf-8') as f:
            sheet = json.load(f)
        character_id = sheet.get('id')
        if not isinstance(character_id, str) or not character_id:
            sys.exit(f'invalid character sheet without an id: {path}')
        if character_id in seen:
            sys.exit(f'duplicate character id {character_id}: {path}')
        seen.add(character_id)
        sheets.append(sheet)
    if not sheets:
        sys.exit(f'no .character files found in {source}')

    compact = json.dumps(sheets, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
    signature = hashlib.sha256(compact.encode('utf-8')).hexdigest()[:16]
    generated = (
        '/* Generated from testgodot/characters/*.character by build.py.\n'
        '   Edit the game character sheets, not this snapshot. */\n'
        f"const BUNDLED_CHARACTER_SIGNATURE='{signature}';\n"
        f'const BUNDLED_CHARACTER_SHEETS={compact};\n'
    )
    previous = None
    if os.path.isfile(CHARACTER_MODULE):
        with open(CHARACTER_MODULE, encoding='utf-8') as f:
            previous = f.read()
    if previous != generated:
        with open(CHARACTER_MODULE, 'w', encoding='utf-8', newline='') as f:
            f.write(generated)
    return len(sheets)

def main():
    character_count = sync_game_characters()
    location_counts = sync_game_locations()
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
    if location_counts:
        locations, rooms, districts = location_counts
        print(f"  synced {locations} game locations, {rooms} rooms, {districts} districts")
    if character_count:
        print(f"  synced {character_count} game characters")

if __name__ == '__main__':
    main()
