# Scenewright

A local authoring tool for the Port Alder visual novel. It reads your `.character`
sheets and `all_locations.json`, lets you write conversations, quests, activities
and repeatables against them, and writes everything back out in the same schema
the game reads.

Generation runs against Ollama on your own machine. Nothing leaves it.

---

## Running it

**1. Ollama must be up.**

    ollama list

If that errors, start Ollama from the Start menu.

**2. Let the browser talk to it.** Once, ever:

    setx OLLAMA_ORIGINS "*"

Then quit Ollama from the system tray (right-click the llama, Quit) and start it
again. `setx` only affects new processes, so the restart matters.

**3. Serve the folder.** Open Command Prompt in this directory:

    python -m http.server 8000

Leave that window open — closing it stops the server.

**4. Open it:**

    http://localhost:8000/scenewright.html

Not by double-clicking the file. A page opened from `file://` can't reach Ollama.

---

## First run

1. Drop `all_locations.json` on the window. You should see
   "61 locations, 306 rooms, 10 districts".
2. Drop your `.character` sheets on. Quests and conversations already in them are
   imported and become editable.
3. **Inspect → Missing characters → Add all as stubs** creates the referenced
   people who have no sheet yet, including the player.
4. **Inspect → Validate** to see what needs attention.

Everything autosaves to the browser, keyed to the URL. Same port next time or your
work won't be there. **Content → Save file** writes a copy you can keep.

---

## What's in here

    scenewright.html    the tool — this is the one to open
    index.html          same tool, loading js/ separately, for editing sources
    js/  css/           the 35 source modules
    build.py            rebuilds scenewright.html from those sources
    README.md           what each module does
    godot/
      dialogue_director.gd   runtime that plays the exported JSON
    import-test.html    diagnostic, if a .character file won't load

---

## Godot side

Drop `godot/dialogue_director.gd` into your project.

    var director := DialogueDirector.new()
    add_child(director)
    director.load_content("res://dialogue/scenes.json")
    director.line_shown.connect(_on_line)
    director.choices_shown.connect(_on_choices)
    director.play_conversation("opening_future_talk")

Call `advance()` on player input, `choose(i)` on a choice. Other useful calls:

    director.available_conversations(location_id, day, block)
    director.available_quests()
    director.available_activities(location_id, day, block)
    director.do_activity("watch_tv_with_mom")   # counts repeats, fires milestones
    director.can_romance("elena_reyes_hale")    # honours the sheet's boundaries
    director.save_state() / load_state(dict)

Export from the tool gives you both shapes: **Character sheets** writes `.character`
files back in your own schema, **Godot JSON** writes the flattened `scenes.json`
this runtime reads.

---

## If something misbehaves

**Nothing generates** — check the lamp top right. Grey means Ollama isn't reachable;
re-do step 2 above.

**"Reply couldn't be parsed"** — the error now shows what the model actually sent.
If it looks cut off, raise the memory window in the Direction tab. Whole-scene mode
asks the most of the model; an 8B is near its limit on nested choices.

**A sheet won't import** — open `import-test.html` and drop the file on it. It
reports the real cause: encoding, a stray comma, wrong shape.

**Changes don't appear** — you're on a cached copy. Ctrl+Shift+R.
