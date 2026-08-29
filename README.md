# Scenewright — source layout

The tool used to be one 3,800-line file. It's now split into modules, with a build
step that puts it back together into a single file you can move around freely.

## Two ways to run it

**During development** — `index.html` loads each module separately, so a change to
one file needs no build step. Requires the local server (it can't run from `file://`).

    cd path\to\scenewright
    python -m http.server 8765
    # then open http://127.0.0.1:8765/index.html

**Finished build** — `scenewright.html` is self-contained. This is the one to keep
a copy of, back up, or hand to someone else.

    python build.py

The Player is a built-in runtime role, not a `.character` package. Port Alder
creates the user's identity and game-state sheet separately for every new game.

The 15 Port Alder NPC sheets and the location registry are built in. When a sibling
game checkout named `testgodot` or `Testing` is present, `build.py` refreshes
`js/01a-game-characters.js` from its `characters/*.character` files and
`js/02a-game-locations.js` from `content/world/all_locations.json` before creating
the one-page build.
Set `SCENEWRIGHT_GAME_CHARACTERS` to the character directory and
`SCENEWRIGHT_GAME_LOCATIONS` to the location file when the repositories are not siblings.
Set `SCENEWRIGHT_GAME_CONTENT` to the game's `content` directory so continuity
checks can index globally owned quests and conversations in the same setup.

The guided character creator and existing-sheet editor both author Port Alder's
hangout invitation threshold, preferred non-romantic activities, and exactly five
relationship levels. Display names are editable without changing the stable character
id, so existing quest and conversation references remain connected.

The sheet editor also has a **Residence** workspace. It links an NPC to any registered
home, keeps the home’s resident list synchronized, displays its entrance, access rules,
rooms, actions, and directional exits, and edits the NPC’s seven-block default home
routine. Discovery sources, hidden state, and invitation policy are saved as small
project overrides so refreshing the game-owned location registry does not erase the
writer’s choices. Hale Home’s legacy Godot navigation map is shown read-only; the
newer residences are read directly from the location registry.

The project toolbar’s **Schedules** button opens a project-wide NPC Schedule Workshop.
It edits ordinary Monday–Sunday routines and rotating four-on/three-off shifts, with
all seven daily activity blocks. Commitments, flexible activities, public encounter
windows, preferred date times, and days off appear together without being flattened
into one type. Writers can paint whole rows, columns, or shift-selected ranges; fill
college, weekday-job, restaurant, weekend, and rotating-shift templates; compare any
group’s best shared times; and run a conflict report for overlaps, unavailable dating
times, and missing or inexact room references.

Every place now opens a **Visual room map** from the Places panel. The editor lays
rooms out from their directional exits, supports drag-to-arrange, and edits the
entrance, room name, access rule, actions, and up/right/down/left destinations.
It can add, duplicate, and remove rooms, create reciprocal return arrows, report
missing or one-way connections, and download one location as a reviewable patch.
Custom-room renames update story locations, schedules, home routines, entrances,
and connected arrows. Game-owned room ids stay locked so existing saves and content
references remain stable.

The Character Story Arc Workshop has two parallel systems. **Relationship path**
keeps the five meter levels, with zero to ten sequential quests at each level.
Independent character-story tabs add any number of friendship, workplace, career,
family, personal, transformation, mystery, slice-of-life, or custom arcs. Each can
contain 1–50 sequential quests and unlock from any supported relationship meter,
a world-state flag/value, memories, or prerequisite quests. Optional arcs record
accept/defer/decline behavior and keep unrelated character content available when
declined. Both systems include planning, readiness checks, linked conversations,
and one-click scaffolding without deleting authored quests when a plan is shortened.

The global **Ensemble Story Arc Studio** opens from **Arcs** in the project toolbar.
It plans any number of multi-character stories as visual node graphs instead of fixed
quest counts. Scene, choice, gate, quest, delay, merge, ending, and placeholder nodes
can branch and reconnect. Every node owns draft dialogue, cast, location and schedule,
requirements, effects, routes, and an implementation status. Arc variables and entry
gates use readable lines such as `emma_rowan.friendship >= 35` or
`waitress_path = true`. The isolated VN playtester supplies editable relationship
presets, route locks, state-change previews, node jumping, restarting, and rewind.
Approved nodes can scaffold normal Screenwriter conversations and quests without
overwriting existing content; arc files can also be downloaded and imported alone.

The project toolbar’s **Director** button opens a visual-novel Scene Director for
every authored conversation. Its cue sheet includes dialogue inside every branch,
with a live 16:10 preview, background/room selection, expressions, portrait variants,
left/center/right/offstage placement, transitions, music, ambience, sound effects,
and freeform direction notes. A **direct** control on each dialogue line opens that
exact cue. Port Alder renders the authored portrait, expression-matched pose,
position, background variant, and transition cues. The runtime retains future audio
support, but this project currently has no audio catalog; the Director keeps those
controls dormant unless an existing scene imports audio direction.
Imported unknown presentation and dialogue-node fields are merged back on export so
opening a scene in the Director never strips newer game metadata.

**build.py** also creates a portable presentation catalog from the neighboring
Godot project's content/presentation/vn_art.json and every character's asset_refs.
The Director uses that catalog for background coverage, portraits, expressions, and
variants. Registered art is distinguished from twelve standardized planned looks,
so a writer may stage rain, night, winter, or another future asset while Godot safely
uses the base image. Choosing **Custom id…** remains available, and unresolved custom
values stay visibly marked until the game catalog contains them. Set
SCENEWRIGHT_GAME_PRESENTATION when the game checkout is not beside Screenwriter.

The project toolbar’s **Build** button creates deployable Port Alder content packages.
It can include the complete character/world set or only files that differ from the
built-in game snapshot. A preflight report blocks broken references, lists warnings,
shows every new, updated, unchanged, and reported-removed file, and identifies ensemble
nodes that have not been scaffolded into playable content. Each embedded file is
checksummed. The Godot importer previews the same operations and makes recoverable
backups before applying them; reported removals are never deleted automatically.

**Inspect → Continuity** builds a read-only dependency index across quests,
conversations, phone messages, characters, locations, calendar hooks, memories,
relationship meters, and state flags. It reports missing targets, circular quest or
message chains, and state values with no project-side writer or reader. Character
focus reduces the report to one NPC and every item touching their stories. The
rename/removal impact view shows what depends on a selected item, what it affects,
and its complete state contract. A generated global-content index recognizes
game-owned quests and conversations without copying them into character packages.

Run the focused state/player and quest-workshop regression checks with:

    node tests/player-runtime.test.js
    node tests/quest-workshop.test.js
    node tests/character-registry.test.js
    node tests/location-registry.test.js
    node tests/phone-authoring.test.js
    node tests/relationship-arc-workshop.test.js
    node tests/character-story-arcs.test.js
    node tests/residence-authoring.test.js
    node tests/room-map-editor.test.js
    node tests/ensemble-arc-studio.test.js
    node tests/game-package-builder.test.js
    node tests/schedule-workshop.test.js
    node tests/continuity-dashboard.test.js
    node tests/scene-director.test.js

## Layout

    index.html          dev shell — markup + one <script> per module
    scenewright.html    the built single file (generated; don't edit)
    build.py            bundler
    manifest.json       load order (regenerate by sorting js/ filenames)
    _markup.html        shared markup template with @@CSS@@ / @@JS@@ slots
    css/app.css         all styles
    js/                 54 modules, loaded in filename order

## The modules

Numeric prefixes are load order, not importance.

    00-state            globals, helpers, localStorage
    01-sheets           .character import, location derivation
    01a-game-characters generated snapshot of all 15 canonical Port Alder NPC sheets
    01b-character-creator  guided Port Alder NPC-sheet creator
    02-places           location package, rooms, district grouping, safe project refresh
    02a-game-locations  generated snapshot of the canonical Port Alder registry
    02b-game-content-index generated ids for game-owned quests and conversations
    02c-game-presentation-assets generated backgrounds, portraits, visual vocabulary, and artwork backlog
    02b-world-builder   custom stats plus a location-and-rooms creator
    03-schedule         grid <-> fixed_commitments, availability
    04-ollama           engines (Ollama, Pawan.Krd, any OpenAI-compatible), model list
    05-tree             node tree traversal (listAt, transcriptAt)
    06-rail             cast / places / content sidebar
    06b-room-map-editor visual layout, room details, entrances, and directional exits
    07-setup            setup strip, presence, condition bar
    08-body             paintBody, tree rendering, node editing
    08b-pool            repeatable line pools
    08c-schedule-ui     the 7x7 schedule editor
    08ca-schedule-workshop project-wide schedules, templates, group times, conflicts
    08d-hooks           draft a quest from a quest_hook
    08e-completion      objective completion editor
    08f-activity        activities and milestones
    08g-quest           quest stages
    08h-quest-builder   story arcs, rewards, and follow-up calendar events
    08i-quest-workshop  conversational quest planning and plain-text conversion
    08j-phone-builder   inbound/outbound texts, replies, triggers, and phone quests
    09-modes            mode bar, placeholders
    10-brief            charBrief, boundsBrief — what the model is told
    10b-speakers        who may speak, player rules
    10c-prompt          buildPrompt for every mode
    10d-parse           JSON recovery, speaker resolution
    10e-generate        askModel, run, continueBranch, fillEmpty
    10f-planner          scene planner and outline-first generation
    11-editor           sheet & limits editor
    11b-relationship-arc flexible-length character story planning and quest readiness
    11c-ensemble-arc   multi-character graph planning, draft VN playtests, scaffolding
    11d-scene-director visual dialogue cue sheet, staging controls, and live VN preview
    11e-artwork-backlog prioritized production phases and live placeholder/registration checks
    12-conditions       condition rows and evaluation
    13-routes           route enumeration, the walker
    14-graph            flow diagrams
    15-registry         walkAll, flags, emotions, coverage, stubs
    15b-validate        the validator
    15c-reach           stat reachability
    15d-simulate        playthrough simulator
    15da-continuity     project dependency index, continuity findings, impact preview
    15e-inspect         the Inspect dialog
    16-map              story map canvas
    17-authored-in      quests/conversations -> editor
    18-authored-out     editor -> quests/conversations
    19-export           export formats, new content, file import
    19a-package-builder validated full/delta packages for the Port Alder repository
    20-boot             wiring and startup

## Adding a module

1. Drop `js/NN-name.js` in, numbered where it should load.
2. `python build.py` — the manifest is rebuilt from the directory listing.
3. Also add a `<script>` tag to `index.html` if you use the dev shell.

Everything shares one global scope, exactly as before — there are no imports or
exports, so a function defined in any module is callable from any other. That was
deliberate: it made the split a pure move with no rewriting, which is why the
built file is behaviourally identical to the version it replaced.
