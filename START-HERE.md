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

**3. Start Scenewright.** Double-click `Start Scenewright.bat`. It finds Python,
reuses its own local server when one is already running, avoids ports occupied by
other programs, and opens the correct page automatically.

To run it manually instead, open Command Prompt in this directory:

    python -m http.server 8765

Leave that window open — closing it stops the server.

**4. Open it:**

    http://127.0.0.1:8765/scenewright.html

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

1. All 15 Port Alder NPCs and all game locations are already loaded. The bundled
   character sheets include their existing quests, conversations, social activities,
   schedules, and text messages. Open **Cast** and **Places** to browse them. The
   launcher rebuilds Scenewright first, so changes in the sibling game's
   `characters` folder and `all_locations.json` are included in the distributable.
   Missing bundled NPCs are added to an existing authoring project without replacing
   characters or same-id story content you already edited.
2. Drop another `.character` sheet on the window only when adding a custom NPC or
   deliberately replacing one character from a separate checkout. Or choose
   **New character** to make a complete Port Alder NPC sheet from a
   guided form. It starts with every required field, the 12 relationship meters,
   five relationship chapters, and a weekday schedule you can edit afterward.
   **World builder** adds reusable custom stats (such as Confidence or Stress) and
   creates a location with its rooms in one step. Open a character's sheet to set
   their identity, pronouns, presentation, traits, likes, dislikes, fears, strengths,
   and starting values for those custom stats. Use **Download game locations** after
   creating places, then put that file in the game's `content/world` folder.
3. **Inspect → Missing characters → Add all as stubs** creates referenced NPCs
   who have no sheet yet. The Player is built in: every new game creates them from
   that user's character-creator choices, so there is never a `player.character` file.
4. **Inspect → Port Alder** before exporting. It checks the game package fields,
   automatic stat branches, and any gate the current game runtime cannot play.
5. **Inspect → Validate** to see what needs attention inside the story itself.

## Lasting relationship consequences

In **Plan scene**, use **Lasting consequence** to unlock a character's next
relationship chapter and/or create a named memory when that scene finishes. The
memory is stored in the save game, not in the sheet. In a later choice, choose
**+ memory** in its conditions to make that choice appear only when the character
remembers that event. This is a simple way to write callbacks without relying on
the model to remember every prior scene.

The same section can make a respectful, story-driven identity update: choose the
character, then enter only the identity details that change and an optional milestone.
The change is saved in the game state and can gate later dialogue with identity or
pronoun conditions. This models the social story choice without recording private
medical information.

Everything autosaves to the browser, keyed to the URL. Same port next time or your
work won't be there. **Content → Save file** writes a copy you can keep.

## Quest and event builder

Use **Quest builder** to turn a story idea into an arc before you draft its scenes.
Give it a title, a quest giver, a summary, objectives, optional prerequisite quest,
completion rewards, and a follow-up calendar event. **Help & examples** shows a
short walkthrough inside the builder. Add every NPC involved in the quest, then
build rewards from the **Who**, **What changes**, and **Amount** menus. Add as many
rows as needed—for example, Emma Trust +3, Emma Love +1, and Player Confidence +2.
The advanced effects field remains available for flags and unlocks such as
`unlocked_calendar`. Each objective becomes a quest stage where you write the
relevant dialogue or task.

Choose **Chat workshop** when you would rather talk the quest through. Pick the
Story Guide for normal planning, or choose the quest giver or another NPC to hear
an in-character reply. The chat accepts ordinary roleplay text and includes quick
prompts for hooks, complications, objectives, and stat-based outcomes. When the
direction feels right, choose **Build quest plan from chat**. Scenewright asks the
model for a plain-text worksheet, parses it locally, and fills the normal editable
quest fields; it never asks the model to author the game's JSON. Existing stage
dialogue and imported automatic branch stages are preserved.

The workshop also keeps **Branch ideas** as planning notes. Use the scene planner's
conditional outcome controls when you write the scene where that stat split occurs.

For a follow-up event, use an in-game date like `Y1-08-23`, choose a time block and
location, then export the character sheet. Completing the quest adds that event to
the game phone calendar.

---

## Text messages and phone quests

Choose **+ Text** to open the phone-message builder. Pick the NPC contact, then build
either an incoming message from that NPC or a player-initiated text that appears as a
send option in the game. Each message has a stable ID, a large writing area, a phone
preview, an arrival trigger, optional weekday/time and stat or flag gates, and any
number of reply choices.

Replies can change relationship meters, start or advance a quest, complete a quest,
defer or fail it, set game state, or open the calendar. Use a player-to-NPC text plus
an NPC follow-up triggered by that sent message to build a longer exchange. New NPCs
can also introduce their contact through their first incoming message.

The **Quest builder** includes a **Phone quest offer** section. Write the NPC's offer
in ordinary text, choose the accept reply, and Scenewright creates the linked phone
message and starts the quest only when the player accepts. The first objective can be
completed by that reply, and later objectives can use **text received**, **text
replied**, or **text sent** as their completion rule.

These are authored choices rather than unrestricted player typing, so quest logic,
stat branches, saves, and testing remain deterministic.

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

For custom stats, use **+ custom stat** in a choice or automatic-outcome condition.
Effects use `stat:character_id:stat_id +2`, for example
`stat:emma_rowan:confidence +5`. The exporter turns it into a Port Alder game effect;
the value is kept in the save game and respects the range set in World builder.

---

## What's in here

    scenewright.html    the tool — this is the one to open
    index.html          same tool, loading js/ separately, for editing sources
    js/  css/           the 44 source modules
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

Export from the tool gives you both shapes: **Port Alder sheets** writes `.character`
files back in the game schema, including directed dialogue graphs, conditional choices,
and automatic stat-outcome branches. **Godot JSON** writes the flattened `scenes.json`
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
