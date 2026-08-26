# Scenewright — source layout

The tool used to be one 3,800-line file. It's now split into modules, with a build
step that puts it back together into a single file you can move around freely.

## Two ways to run it

**During development** — `index.html` loads each module separately, so a change to
one file needs no build step. Requires the local server (it can't run from `file://`).

    cd path\to\scenewright
    python -m http.server 8000
    # then open http://localhost:8000/index.html

**Finished build** — `scenewright.html` is self-contained. This is the one to keep
a copy of, back up, or hand to someone else.

    python build.py

## Layout

    index.html          dev shell — markup + one <script> per module
    scenewright.html    the built single file (generated; don't edit)
    build.py            bundler
    manifest.json       load order (regenerate by sorting js/ filenames)
    _markup.html        shared markup template with @@CSS@@ / @@JS@@ slots
    css/app.css         all styles
    js/                 39 modules, loaded in filename order

## The modules

Numeric prefixes are load order, not importance.

    00-state            globals, helpers, localStorage
    01-sheets           .character import, location derivation
    01b-character-creator  guided Port Alder NPC-sheet creator
    02-places           location package, rooms, district grouping
    02b-world-builder   custom stats plus a location-and-rooms creator
    03-schedule         grid <-> fixed_commitments, availability
    04-ollama           engines (Ollama, Pawan.Krd, any OpenAI-compatible), model list
    05-tree             node tree traversal (listAt, transcriptAt)
    06-rail             cast / places / content sidebar
    07-setup            setup strip, presence, condition bar
    08-body             paintBody, tree rendering, node editing
    08b-pool            repeatable line pools
    08c-schedule-ui     the 7x7 schedule editor
    08d-hooks           draft a quest from a quest_hook
    08e-completion      objective completion editor
    08f-activity        activities and milestones
    08g-quest           quest stages
    09-modes            mode bar, placeholders
    10-brief            charBrief, boundsBrief — what the model is told
    10b-speakers        who may speak, player rules
    10c-prompt          buildPrompt for every mode
    10d-parse           JSON recovery, speaker resolution
    10e-generate        askModel, run, continueBranch, fillEmpty
    10f-planner          scene planner and outline-first generation
    11-editor           sheet & limits editor
    12-conditions       condition rows and evaluation
    13-routes           route enumeration, the walker
    14-graph            flow diagrams
    15-registry         walkAll, flags, emotions, coverage, stubs
    15b-validate        the validator
    15c-reach           stat reachability
    15d-simulate        playthrough simulator
    15e-inspect         the Inspect dialog
    16-map              story map canvas
    17-authored-in      quests/conversations -> editor
    18-authored-out     editor -> quests/conversations
    19-export           export formats, new content, file import
    20-boot             wiring and startup

## Adding a module

1. Drop `js/NN-name.js` in, numbered where it should load.
2. `python build.py` — the manifest is rebuilt from the directory listing.
3. Also add a `<script>` tag to `index.html` if you use the dev shell.

Everything shares one global scope, exactly as before — there are no imports or
exports, so a function defined in any module is callable from any other. That was
deliberate: it made the split a pure move with no rewriting, which is why the
built file is behaviourally identical to the version it replaced.
