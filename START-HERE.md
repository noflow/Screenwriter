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

Or simply double-click `Start Scenewright.bat`. It starts the server if needed and
opens the app for you.

**4. Open it:**

    http://localhost:8000/scenewright.html

Not by double-clicking the file. A page opened from `file://` can't reach Ollama.

---

## Using a hosted model instead

Ollama is the default and the only one that keeps everything on your machine. If you
want something stronger than an 8B, the **Direction** tab now has an **Engine** picker:

    Ollama — on this machine     the default, nothing leaves
    Pawan.Krd — hosted           https://api.pawan.krd/v1, OpenAI-compatible
    Pawan.Krd · CosmosRP 3.5     their dedicated roleplay model
    Other OpenAI-compatible      any endpoint shaped like OpenAI's

For Pawan.Krd, create an API key in its dashboard and paste it into the Engine block.
The CosmosRP choice automatically selects `pkrd/cosmosrp-3.5`. If another endpoint
won't list its own models, type the model names you want in **Model names** and they
are used as given.

The key is kept in this browser only — it is never written into the project file or
an export. Use **Forget API key** in the Engine block to remove it from this browser.
Two things worth knowing before you switch: your prompts, character sheets
and dialogue are sent to a third party, and **Include private profile** sends the
private_profile block with them. The tool warns you when both are on at once.
Whole-scene mode accepts an ordinary role-play transcript and converts it into the
editor's scene structure automatically, so the model does not need to write JSON.

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

## Planning a stronger first draft

Choose **Plan scene** beside Whole scene. Add whatever you know about the setting,
goal, tension, must-hit beat, tone, and final player choice, then choose **Draft
outline**. You can edit the outline before choosing **Write scene from outline**.
The plan is saved with the conversation, so you can reopen it later and revise the
next draft without recreating the setup.

For a stat-based ending, use **Conditional outcome** in the planner. Pick a character,
stat, and threshold, then describe what should happen at or above it and what should
happen below it. For example, `friendship ≥ 50` can lead to a warmer outcome while
`friendship ≤ 49` leads to a guarded one. These are automatic runtime branches, not
player choice buttons, and remain editable in the generated scene.

Add a middle outcome to use three tiers: for example, low at `≤ 24`, middle from
`25–49`, and high at `≥ 50`. In the generated scene, use **+ stat** inside any
automatic outcome to combine rules, such as friendship at least 50 *and* trust at
least 30. Validate warns when combined stat rules contradict each other and a branch
can never run.

Each outcome can also change game state. Add effects such as `elena_reyes.friendship +2`,
`elena_reyes.trust +1`, or `argument_resolved`; separate several effects with semicolons.
Use **Preview stat value** to see which outcome a given number would take before you
generate the scene.

---

## What's in here

    scenewright.html    the tool — this is the one to open
    index.html          same tool, loading js/ separately, for editing sources
    js/  css/           the 37 source modules
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

**"Reply couldn't be parsed"** — this applies to short JSON-based tools such as
choices and chat continuation. The whole-scene writer uses ordinary role-play text
instead. If a reply looks cut off, raise the memory window in the Direction tab.

**A sheet won't import** — open `import-test.html` and drop the file on it. It
reports the real cause: encoding, a stray comma, wrong shape.

**Changes don't appear** — you're on a cached copy. Ctrl+Shift+R.

---

## Putting it in Git

`.gitattributes` is included and normalises everything to LF in the repository.
That's what silences the *"this file uses LF but Git is configured to convert them
to CRLF"* warning — the files stay LF where it matters, and Windows can still check
out CRLF locally if you want it to.

If you already committed files before adding it, renormalise once:

    git add --renormalize .
    git commit -m "Normalise line endings"

`.gitignore` excludes the built `scenewright.html`, since `build.py` regenerates it
and committing it produces a 225KB diff on every change. If you'd rather commit it
so someone can download the tool without building, delete that line from
`.gitignore`.

`build.py` writes LF regardless of platform, so the bundle is byte-identical whether
it was built on Windows, macOS or Linux.
