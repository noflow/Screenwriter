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
CONTENT_INDEX_MODULE = os.path.join(HERE, 'js', '02b-game-content-index.js')
PRESENTATION_MODULE = os.path.join(HERE, 'js', '02c-game-presentation-assets.js')

def game_location_source():
    """Find the canonical registry when the game and tool share a workspace.

    SCENEWRIGHT_GAME_LOCATIONS keeps the build portable when the repositories are
    checked out somewhere other than as siblings.
    """
    configured = os.environ.get('SCENEWRIGHT_GAME_LOCATIONS', '').strip()
    candidates = [configured] if configured else []
    candidates.extend(os.path.abspath(os.path.join(HERE, '..', directory,
        'content', 'world', 'all_locations.json')) for directory in ('testgodot', 'Testing'))
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
    candidates.extend(os.path.abspath(os.path.join(HERE, '..', directory, 'characters'))
        for directory in ('testgodot', 'Testing'))
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

def game_content_source():
    """Find Port Alder's global content directory for dependency inspection."""
    configured = os.environ.get('SCENEWRIGHT_GAME_CONTENT', '').strip()
    candidates = [configured] if configured else []
    candidates.extend(os.path.abspath(os.path.join(HERE, '..', directory, 'content'))
        for directory in ('testgodot', 'Testing'))
    return next((path for path in candidates if path and os.path.isdir(path)), None)

def sync_game_content_index():
    """Build a lightweight id/title index for global quests and conversations.

    Screenwriter edits character packages, but those packages may legitimately
    reference quests or conversations owned by the game's global content. Keeping
    their ids here lets continuity analysis distinguish an external definition from
    a genuinely missing follow-up without copying global story data into a project.
    """
    source = game_content_source()
    if not source:
        if not os.path.isfile(CONTENT_INDEX_MODULE):
            with open(CONTENT_INDEX_MODULE, 'w', encoding='utf-8', newline='') as f:
                f.write('const BUNDLED_GAME_CONTENT_INDEX={quests:[],conversations:[]};\n')
        return None

    index = {'quests': [], 'conversations': []}
    seen = {key: set() for key in index}
    for root, _, filenames in os.walk(source):
        for filename in sorted(name for name in filenames if name.endswith('.json')):
            path = os.path.join(root, filename)
            with open(path, encoding='utf-8') as f:
                package = json.load(f)
            relative = os.path.relpath(path, source).replace(os.sep, '/')
            for key in index:
                for item in package.get(key, []):
                    item_id = item.get('id') if isinstance(item, dict) else None
                    if not item_id or item_id in seen[key]:
                        continue
                    seen[key].add(item_id)
                    index[key].append({
                        'id': item_id,
                        'title': item.get('title') or item.get('name') or item_id,
                        'source': relative,
                    })
    for rows in index.values():
        rows.sort(key=lambda item: item['id'])
    compact = json.dumps(index, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
    generated = (
        '/* Generated from Port Alder global content JSON by build.py.\n'
        '   This is a reference index; global story data remains game-owned. */\n'
        f'const BUNDLED_GAME_CONTENT_INDEX={compact};\n'
    )
    previous = None
    if os.path.isfile(CONTENT_INDEX_MODULE):
        with open(CONTENT_INDEX_MODULE, encoding='utf-8') as f:
            previous = f.read()
    if previous != generated:
        with open(CONTENT_INDEX_MODULE, 'w', encoding='utf-8', newline='') as f:
            f.write(generated)
    return len(index['quests']), len(index['conversations'])

def game_presentation_source():
    """Find the canonical Port Alder VN presentation manifest."""
    configured = os.environ.get('SCENEWRIGHT_GAME_PRESENTATION', '').strip()
    candidates = [configured] if configured else []
    candidates.extend(os.path.abspath(os.path.join(HERE, '..', directory,
        'content', 'presentation', 'vn_art.json')) for directory in ('testgodot', 'Testing'))
    return next((path for path in candidates if path and os.path.isfile(path)), None)

def _presentation_audio_type(entry):
    """Normalize the runtime bus/type metadata into Director cue categories."""
    explicit = str(entry.get('cue_type') or entry.get('type') or '').strip().lower()
    if explicit in ('music', 'ambience', 'sfx'):
        return explicit
    bus = str(entry.get('bus') or '').strip().lower()
    if bus == 'music':
        return 'music'
    if bus == 'ambience':
        return 'ambience'
    return 'sfx'

def sync_game_presentation_catalog():
    """Bundle registered VN assets, shared vocabulary, and the production backlog."""
    source = game_presentation_source()
    if not source:
        if not os.path.isfile(PRESENTATION_MODULE):
            with open(PRESENTATION_MODULE, 'w', encoding='utf-8', newline='') as f:
                f.write('const BUNDLED_PRESENTATION_ASSET_CATALOG={backgrounds:[],portraits:[],audio:[],vocabulary:{background_variants:[],portrait_expressions:[]},backlog:{phases:[]}};\n')
        return None

    with open(source, encoding='utf-8') as f:
        package = json.load(f)
    backgrounds = package.get('vn_backgrounds')
    audio = package.get('vn_audio')
    if not isinstance(backgrounds, list) or not isinstance(audio, list):
        sys.exit(f'invalid game presentation manifest: {source}')
    vocabulary = package.get('art_vocabulary')
    if not isinstance(vocabulary, dict):
        sys.exit(f'missing art vocabulary in game presentation manifest: {source}')
    for vocabulary_name in ('background_variants', 'portrait_expressions'):
        entries = vocabulary.get(vocabulary_name)
        if not isinstance(entries, list) or not entries or any(
            not isinstance(entry, dict) or not entry.get('id') or not entry.get('label') for entry in entries
        ):
            sys.exit(f'invalid {vocabulary_name} vocabulary in game presentation manifest: {source}')
    backlog = package.get('production_backlog')
    if not isinstance(backlog, dict) or not isinstance(backlog.get('phases'), list):
        sys.exit(f'invalid artwork production backlog in game presentation manifest: {source}')

    catalog = {
        'format_version': 1,
        'source_package_id': package.get('package_id', ''),
        'backgrounds': [],
        'portraits': [],
        'audio': [],
        'vocabulary': {
            name: [
                {'id': entry['id'], 'label': entry['label']}
                for entry in vocabulary[name]
            ]
            for name in ('background_variants', 'portrait_expressions')
        },
        'backlog': backlog,
    }
    for entry in backgrounds:
        if not isinstance(entry, dict) or not entry.get('id'):
            sys.exit(f'invalid background entry in game presentation manifest: {source}')
        row = {
            key: entry[key] for key in ('id', 'location', 'room', 'path', 'variants', 'credit')
            if key in entry
        }
        row['asset_status'] = entry.get('status') or (
            'placeholder' if 'placeholder' in str(entry.get('credit', '')).lower() else 'registered'
        )
        catalog['backgrounds'].append(row)
    for entry in audio:
        if not isinstance(entry, dict) or not entry.get('id'):
            sys.exit(f'invalid audio entry in game presentation manifest: {source}')
        row = {key: entry[key] for key in ('id', 'path', 'bus', 'loop', 'credit') if key in entry}
        row['cue_type'] = _presentation_audio_type(entry)
        catalog['audio'].append(row)

    character_source = game_character_source()
    if character_source:
        for filename in sorted(name for name in os.listdir(character_source) if name.endswith('.character')):
            path = os.path.join(character_source, filename)
            with open(path, encoding='utf-8') as f:
                sheet = json.load(f)
            character_id = sheet.get('id')
            if not character_id:
                continue
            refs = sheet.get('asset_refs') if isinstance(sheet.get('asset_refs'), dict) else {}
            for entry in refs.get('portraits', []):
                if not isinstance(entry, dict) or not entry.get('id'):
                    continue
                row = {key: entry[key] for key in ('id', 'path', 'accent', 'anchor') if key in entry}
                row['character_id'] = character_id
                row['asset_status'] = entry.get('status') or (
                    'placeholder' if '_fallback_portrait' in str(entry.get('path', '')) else 'registered'
                )
                catalog['portraits'].append(row)
            for entry in refs.get('audio', []):
                if not isinstance(entry, dict) or not entry.get('id'):
                    continue
                row = {key: entry[key] for key in ('id', 'path', 'bus', 'loop', 'credit') if key in entry}
                row['character_id'] = character_id
                row['cue_type'] = _presentation_audio_type(entry)
                catalog['audio'].append(row)

    catalog['backgrounds'].sort(key=lambda item: item['id'])
    catalog['portraits'].sort(key=lambda item: (item['character_id'], item['id']))
    catalog['audio'].sort(key=lambda item: (item.get('cue_type', ''), item.get('character_id', ''), item['id']))
    compact = json.dumps(catalog, ensure_ascii=False, separators=(',', ':')).replace('</', '<\\/')
    signature = hashlib.sha256(compact.encode('utf-8')).hexdigest()[:16]
    generated = (
        '/* Generated from Port Alder VN art and character asset references by build.py.\n'
        '   Edit the game manifest or character sheets, not this snapshot. */\n'
        f"const BUNDLED_PRESENTATION_ASSET_SIGNATURE='{signature}';\n"
        f'const BUNDLED_PRESENTATION_ASSET_CATALOG={compact};\n'
    )
    previous = None
    if os.path.isfile(PRESENTATION_MODULE):
        with open(PRESENTATION_MODULE, encoding='utf-8') as f:
            previous = f.read()
    if previous != generated:
        with open(PRESENTATION_MODULE, 'w', encoding='utf-8', newline='') as f:
            f.write(generated)
    return (
        len(catalog['backgrounds']), len(catalog['portraits']), len(catalog['audio']),
        len(catalog['vocabulary']['background_variants']),
        len(catalog['vocabulary']['portrait_expressions']),
        len(catalog['backlog']['phases']),
        sum(len(phase.get('assets', [])) for phase in catalog['backlog']['phases'] if isinstance(phase, dict)),
    )

def main():
    character_count = sync_game_characters()
    location_counts = sync_game_locations()
    content_counts = sync_game_content_index()
    presentation_counts = sync_game_presentation_catalog()
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
    if content_counts:
        quests, conversations = content_counts
        print(f"  indexed {quests} global quests and {conversations} global conversations")
    if presentation_counts:
        backgrounds, portraits, audio, variants, expressions, art_phases, art_assets = presentation_counts
        print(f"  catalogued {backgrounds} VN backgrounds, {portraits} portraits, and {audio} audio cues")
        print(f"  standardized {variants} planned variants and {expressions} portrait expressions")
        print(f"  prioritized {art_assets} artwork tasks across {art_phases} production phases")

if __name__ == '__main__':
    main()
