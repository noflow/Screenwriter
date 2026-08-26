extends Node
class_name DialogueDirector

## Loads and plays content exported from Scenewright (format: scenewright.v3).
##
## v3 adds the declared state registry (flag and meter types, starting values,
## ceilings), rooms alongside locations, activities, and chapter thresholds.
##
## Handles three content types:
##   conversations — branching node trees, played once or gated by chapter
##   quests        — ordered stages, each with its own location and completion flag
##   repeatables   — pools of idle lines, picked at random and filtered by chapter
##
## Usage:
##   var d := DialogueDirector.new()
##   add_child(d)
##   d.load_content("res://dialogue/scenes.json")
##   d.line_shown.connect(_on_line)
##   d.choices_shown.connect(_on_choices)
##   d.play_conversation("theo_dorm_first_visit")

signal line_shown(speaker_id: String, speaker_name: String, text: String, emotion: String, color: Color)
signal choices_shown(options: Array[String])
signal content_started(content_id: String, location_id: String, background: String)
signal content_finished(content_id: String)
signal flag_changed(key: String, value: Variant)
signal quest_stage_completed(quest_id: String, stage_id: String)
signal chapter_advanced(character_id: String, level: int)

var characters: Dictionary = {}     ## id -> {name, color, chapters, defaults}
var locations: Dictionary = {}      ## id -> {name, background, district}
var conversations: Dictionary = {}
var quests: Dictionary = {}
var repeatables: Array = []
var activities: Dictionary = {}     ## id -> activity definition

## Runtime state — save and restore these with your save game.
var flags: Dictionary = {}          ## "trust" -> 4, "met_theo" -> true
var chapters: Dictionary = {}       ## character_id -> current relationship level
var seen: Dictionary = {}           ## content_id -> true
var quest_stage: Dictionary = {}    ## quest_id -> index of the next unplayed stage

## The declared state contract from the export: which flags and meters exist,
## what type they are, where they start, and what they may not exceed. Types are
## decided by the authoring tool now, not inferred here from punctuation.
var registry: Dictionary = {}
var _bounds: Dictionary = {}        ## key -> {"min": float, "max": float}
var _declared: Dictionary = {}      ## key -> true; anything else is a typo
var _chapter_rules: Dictionary = {} ## character_id -> Array of {level, requires}

var _active_id: String = ""
var _active_quest: String = ""
var _active_flag: String = ""
var _stack: Array = []
var _pending: Array = []
var _rng := RandomNumberGenerator.new()


func _ready() -> void:
	_rng.randomize()


# ---------------------------------------------------------------- loading

func load_content(path: String) -> bool:
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		push_error("DialogueDirector: can't open %s" % path)
		return false

	var data: Variant = JSON.parse_string(file.get_as_text())
	if typeof(data) != TYPE_DICTIONARY:
		push_error("DialogueDirector: %s isn't valid JSON" % path)
		return false

	characters.clear()
	for c: Dictionary in data.get("characters", []):
		characters[c.get("id", "")] = {
			"name": c.get("name", "?"),
			"color": Color(c.get("color", "#ffffff")),
			"age": c.get("age", null),
			"romance_eligible": bool(c.get("romance_eligible", false)),
			"family_only": bool(c.get("family_only", false)),
			"hard_limits": c.get("hard_limits", []),
			"adult_hard_limits": c.get("adult_hard_limits", []),
			"chapters": c.get("chapters", []),
			"defaults": c.get("relationship_defaults", {}),
		}
		_chapter_rules[c.get("id", "")] = c.get("chapters", [])
		# Start every character at chapter 1 unless a save says otherwise.
		if not chapters.has(c.get("id", "")):
			chapters[c.get("id", "")] = 1
		# Seed relationship stats from the sheet's starting values.
		for k: String in c.get("relationship_defaults", {}):
			var key := "%s.%s" % [c.get("id", ""), k]
			if not stats.has(key):
				stats[key] = float(c["relationship_defaults"][k])

	locations.clear()
	for l: Dictionary in data.get("locations", []):
		locations[l.get("id", "")] = l

	_load_registry(data.get("registry", {}))

	conversations.clear()
	for c: Dictionary in data.get("conversations", []):
		conversations[c.get("id", "")] = c

	quests.clear()
	for q: Dictionary in data.get("quests", []):
		quests[q.get("id", "")] = q
		if not quest_stage.has(q.get("id", "")):
			quest_stage[q.get("id", "")] = 0

	repeatables = data.get("repeatables", [])

	activities.clear()
	for a: Dictionary in data.get("activities", []):
		activities[a.get("id", "")] = a

	# Chapters may already qualify at their starting meter values.
	for id: String in characters:
		_check_chapter(id)

	return true


# ---------------------------------------------------------------- the state contract

## Seeds every declared flag, meter and counter, and remembers the bounds so
## nothing can drift past a gate. Safe to call on a save load as well: values
## already present are left alone.
func _load_registry(reg: Dictionary) -> void:
	registry = reg

	for f: Dictionary in reg.get("flags", []):
		var key: String = f.get("key", "")
		if key == "":
			continue
		_declared[key] = true
		if not flags.has(key):
			flags[key] = f.get("initial", false)

	for s: Dictionary in reg.get("stats", []):
		var key: String = s.get("key", "")
		if key == "":
			continue
		_declared[key] = true
		var lo: Variant = s.get("min", null)
		var hi: Variant = s.get("max", null)
		if lo != null or hi != null:
			_bounds[key] = {
				"min": float(lo) if lo != null else -INF,
				"max": float(hi) if hi != null else INF,
			}
		if not stats.has(key):
			stats[key] = _clamp_key(key, float(s.get("initial", 0)))

	for c: Dictionary in reg.get("counters", []):
		var key: String = c.get("key", "")
		if key == "":
			continue
		_declared[key] = true
		if not stats.has(key):
			stats[key] = float(c.get("initial", 0))


func _clamp_key(key: String, value: float) -> float:
	if not _bounds.has(key):
		return value
	var b: Dictionary = _bounds[key]
	return clampf(value, b["min"], b["max"])


func _warn_undeclared(key: String) -> void:
	if registry.is_empty() or _declared.has(key) or key.begins_with("met_"):
		return
	push_warning("DialogueDirector: '%s' is not in the exported registry — likely a typo, or the export is stale." % key)


## Moves a character up as soon as a chapter's requirements are satisfied.
## Without this every relationship sits at 1 and chapter-gated content is dead.
func _check_chapter(character_id: String) -> void:
	var rules: Array = _chapter_rules.get(character_id, [])
	if rules.is_empty():
		return
	var level: int = int(chapters.get(character_id, 1))
	var best: int = level
	for r: Dictionary in rules:
		var need: int = int(r.get("level", 0))
		var reqs: Array = r.get("requires", [])
		if need > best and not reqs.is_empty() and check_all(reqs):
			best = need
	if best > level:
		chapters[character_id] = best
		chapter_advanced.emit(character_id, best)


# ---------------------------------------------------------------- queries

## Conversations available right now, given where the player is and when.
func available_conversations(location_id: String, day: String, block: String,
		room_id: String = "") -> Array[String]:
	var out: Array[String] = []
	for id: String in conversations:
		var c: Dictionary = conversations[id]
		# Activity and milestone dialogue is played through do_activity, never offered by place.
		if bool(c.get("internal", false)):
			continue
		if seen.has(id) and not bool(c.get("replayable", false)):
			continue
		if c.get("location", "") != location_id:
			continue
		# A scene pinned to a room only offers itself in that room. Pass "" for
		# room_id if the game does not track rooms and it matches anything.
		var want_room: String = String(c.get("room", ""))
		if want_room != "" and room_id != "" and want_room != room_id:
			continue
		if c.get("day", "") != "" and c.get("day", "") != day:
			continue
		if c.get("block", "") != "" and c.get("block", "") != block:
			continue
		if not _chapter_ok(c):
			continue
		if not check_all(c.get("requires", [])):
			continue
		out.append(id)
	return out


## One idle line for a character, or "" if they have nothing to say here.
func idle_line(character_id: String, location_id: String = "", block: String = "",
		day: String = "") -> Dictionary:
	var pool: Array = []
	for r: Dictionary in repeatables:
		if r.get("character", "") != character_id:
			continue
		if location_id != "" and r.get("location", "") != "" and r.get("location", "") != location_id:
			continue
		var blocks: Array = r.get("blocks", [])
		if block != "" and not blocks.is_empty() and not blocks.has(block):
			continue
		var days: Array = r.get("days", [])
		if day != "" and not days.is_empty() and not days.has(day):
			continue
		if not check_all(r.get("requires", [])):
			continue
		var level: int = chapters.get(character_id, 1)
		for line: Dictionary in r.get("lines", []):
			if int(line.get("min_chapter", 0)) <= level:
				pool.append(line)

	if pool.is_empty():
		return {}
	return pool[_rng.randi_range(0, pool.size() - 1)]


# ---------------------------------------------------------------- conditions

## Relationship stats, keyed "character_id.stat" — e.g. stats["elena_reyes_hale.love"]
var stats: Dictionary = {}


## Evaluates one requirement row from the export.
func check(req: Dictionary) -> bool:
	var kind: String = req.get("type", "flag")
	var op: String = req.get("op", "gte")
	var target: float = float(req.get("value", 0))
	var have: Variant

	match kind:
		"chapter":
			have = int(chapters.get(req.get("character", ""), 1))
		"stat":
			have = float(stats.get("%s.%s" % [req.get("character", ""), req.get("key", "")], 0.0))
		"met":
			return bool(flags.get("met_" + String(req.get("character", "")), false))
		_:
			have = flags.get(req.get("key", ""), 0)

	if op == "is_true":
		return _truthy(have)
	if op == "is_false":
		return not _truthy(have)

	var a := float(have) if typeof(have) != TYPE_BOOL else (1.0 if have else 0.0)
	match op:
		"gte": return a >= target
		"lte": return a <= target
		"eq":  return is_equal_approx(a, target)
	return true


func check_all(reqs: Array) -> bool:
	for r: Dictionary in reqs:
		if not check(r):
			return false
	return true


func _truthy(v: Variant) -> bool:
	if typeof(v) == TYPE_BOOL:
		return v
	return float(v) > 0.0


## Human-readable reason a piece of content is locked — useful for debug overlays.
func unmet(reqs: Array) -> Array[String]:
	var out: Array[String] = []
	for r: Dictionary in reqs:
		if not check(r):
			out.append("%s %s %s" % [r.get("type", ""), r.get("key", r.get("character", "")),
				str(r.get("value", ""))])
	return out


## Options the player can actually pick from the current choice, as [index, ...].
func open_choices() -> Array[int]:
	var out: Array[int] = []
	for i in _pending.size():
		if check_all(_pending[i].get("requires", [])):
			out.append(i)
	return out


func adjust_stat(character_id: String, key: String, delta: float) -> void:
	var k := "%s.%s" % [character_id, key]
	_warn_undeclared(k)
	stats[k] = _clamp_key(k, float(stats.get(k, 0.0)) + delta)
	flag_changed.emit(k, stats[k])
	_check_chapter(character_id)


func meet(character_id: String) -> void:
	set_flag("met_" + character_id)


func _chapter_ok(c: Dictionary) -> bool:
	var need: int = int(c.get("chapter", 0))
	if need <= 0:
		return true
	for id: String in c.get("cast", []):
		if int(chapters.get(id, 1)) >= need:
			return true
	return false


# ---------------------------------------------------------------- boundaries

## Gate romance menus, gift options, and affection actions on this.
## Defaults to false for any character not in the sheet — fail closed, not open.
func can_romance(character_id: String) -> bool:
	return bool(characters.get(character_id, {}).get("romance_eligible", false))


func is_family(character_id: String) -> bool:
	return bool(characters.get(character_id, {}).get("family_only", false))


## True if the tag is a declared hard limit for this character.
func is_limit(character_id: String, tag: String) -> bool:
	var c: Dictionary = characters.get(character_id, {})
	return c.get("hard_limits", []).has(tag) or c.get("adult_hard_limits", []).has(tag)


## Filter a list of player actions down to the ones this character permits.
## Each action is {"id": "flirt", "label": "...", "requires": ["romance"], "limit_tag": "..."}
func allowed_actions(character_id: String, actions: Array) -> Array:
	var out: Array = []
	for a: Dictionary in actions:
		var needs: Array = a.get("requires", [])
		if needs.has("romance") and not can_romance(character_id):
			continue
		if needs.has("not_family") and is_family(character_id):
			continue
		var tag: String = a.get("limit_tag", "")
		if tag != "" and is_limit(character_id, tag):
			continue
		out.append(a)
	return out


# ---------------------------------------------------------------- playback

func play_conversation(id: String) -> void:
	if not conversations.has(id):
		push_error("DialogueDirector: no conversation '%s'" % id)
		return
	var c: Dictionary = conversations[id]
	_active_id = id
	_active_quest = ""
	_active_flag = String(c.get("sets_flag", ""))
	_begin(c.get("nodes", []), c.get("location", ""), c.get("cast", []))


## Plays the next unplayed stage of a quest. Returns false when it's done.
func play_quest_stage(quest_id: String) -> bool:
	if not quests.has(quest_id):
		push_error("DialogueDirector: no quest '%s'" % quest_id)
		return false

	var q: Dictionary = quests[quest_id]
	var idx: int = int(quest_stage.get(quest_id, 0))
	var stages: Array = q.get("stages", [])
	if idx >= stages.size():
		return false

	var stage: Dictionary = stages[idx]
	_active_id = quest_id + "/" + str(stage.get("id", idx))
	_active_quest = quest_id
	_active_flag = ""
	_begin(stage.get("nodes", []), stage.get("location", ""), q.get("cast", []))
	return true


## Quests whose own requirements are met and that still have stages left.
func available_quests() -> Array[String]:
	var out: Array[String] = []
	for id: String in quests:
		var q: Dictionary = quests[id]
		if not check_all(q.get("requires", [])):
			continue
		var act: Dictionary = q.get("activation", {})
		if act.get("event", "") == "quest_completed":
			var prev: String = act.get("quest", "")
			if prev != "" and not _quest_done(prev):
				continue
		if int(quest_stage.get(id, 0)) >= q.get("stages", []).size():
			continue
		var stage: Dictionary = q.get("stages", [])[int(quest_stage.get(id, 0))]
		if not check_all(stage.get("requires", [])):
			continue
		out.append(id)
	return out


func _quest_done(quest_id: String) -> bool:
	if not quests.has(quest_id):
		return false
	return int(quest_stage.get(quest_id, 0)) >= quests[quest_id].get("stages", []).size()


func quest_location(quest_id: String) -> String:
	var q: Dictionary = quests.get(quest_id, {})
	var idx: int = int(quest_stage.get(quest_id, 0))
	var stages: Array = q.get("stages", [])
	if idx >= stages.size():
		return ""
	return stages[idx].get("location", "")


func _begin(nodes: Array, location_id: String, cast: Array = []) -> void:
	_pending.clear()
	_stack = [{"nodes": nodes, "index": 0}]
	# Anyone on screen counts as met. Nothing else sets met_*, so every gate on
	# it would otherwise stay false for the whole game.
	for who: String in cast:
		if who != "" and not bool(flags.get("met_" + who, false)):
			meet(who)
	var bg: String = locations.get(location_id, {}).get("background", "")
	content_started.emit(_active_id, location_id, bg)
	advance()


## Call on player input. Ignored while choices are on screen.
func advance() -> void:
	if not _pending.is_empty():
		return

	while not _stack.is_empty():
		var frame: Dictionary = _stack.back()
		if frame.index >= frame.nodes.size():
			_stack.pop_back()
			continue

		var node: Dictionary = frame.nodes[frame.index]
		frame.index += 1

		match node.get("type", ""):
			"line":
				var id: String = node.get("speaker", "")
				var who: Dictionary = characters.get(id, {"name": id, "color": Color.WHITE})
				line_shown.emit(id, who.name, node.get("text", ""),
					node.get("emotion", ""), who.color)
				return
			"choice":
				_pending = node.get("options", [])
				var labels: Array[String] = []
				for opt: Dictionary in _pending:
					labels.append(opt.get("text", ""))
				choices_shown.emit(labels)
				return
			"gate":
				# A gate is an automatic branch: first matching outcome wins. The
				# authoring tool writes complementary stat conditions for high/low paths.
				for branch: Dictionary in node.get("options", []):
					if check_all(branch.get("requires", [])):
						var effect: String = String(branch.get("flag", "")).strip_edges()
						if effect != "":
							set_flag(effect)
						_stack.append({"nodes": branch.get("nodes", []), "index": 0})
						break
			"jump":
				var target: String = node.get("target", "")
				if target == "":
					continue
				_finish()
				if conversations.has(target):
					play_conversation(target)
				elif quests.has(target):
					play_quest_stage(target)
				else:
					push_warning("DialogueDirector: jump target '%s' not found" % target)
				return

	_finish()


func choose(index: int) -> void:
	if index < 0 or index >= _pending.size():
		return
	var opt: Dictionary = _pending[index]
	if not check_all(opt.get("requires", [])):
		return
	_pending = []

	var flag: String = String(opt.get("flag", "")).strip_edges()
	if flag != "":
		set_flag(flag)

	_stack.append({"nodes": opt.get("nodes", []), "index": 0})
	advance()


func has_choice() -> bool:
	return not _pending.is_empty()


func _finish() -> void:
	seen[_active_id] = true

	if _active_flag != "":
		set_flag(_active_flag)
		_active_flag = ""

	if _active_quest != "":
		var q: Dictionary = quests[_active_quest]
		var idx: int = int(quest_stage.get(_active_quest, 0))
		var stages: Array = q.get("stages", [])
		if idx < stages.size():
			var stage: Dictionary = stages[idx]
			var f: String = String(stage.get("sets_flag", "")).strip_edges()
			if f != "":
				set_flag(f)
			quest_stage[_active_quest] = idx + 1
			quest_stage_completed.emit(_active_quest, String(stage.get("id", "")))

	content_finished.emit(_active_id)
	_active_id = ""
	_active_quest = ""


# ---------------------------------------------------------------- activities

## How many times the player has completed an activity.
func activity_count(activity_id: String) -> int:
	var a: Dictionary = activities.get(activity_id, {})
	return int(stats.get(a.get("counter_key", "activity.%s.count" % activity_id), 0))


## Which beat plays next — the highest matching milestone, else the base.
## Returns {"conversation": id, "milestone": Dictionary or {}}.
func next_beat(activity_id: String) -> Dictionary:
	var a: Dictionary = activities.get(activity_id, {})
	if a.is_empty():
		return {}

	# The count AFTER this run is what a milestone's "at" refers to.
	var n := activity_count(activity_id) + 1

	# Milestones export highest-first, so the most specific match wins.
	for m: Dictionary in a.get("milestones", []):
		if int(m.get("at", 0)) > n:
			continue
		if bool(m.get("once", true)) and seen.has(m.get("conversation", "")):
			continue
		# An exact-hit milestone only fires on its own repeat; a lower one can catch up
		# if its condition was unmet at the time.
		if int(m.get("at", 0)) == n or not bool(m.get("once", true)):
			if check_all(_milestone_reqs(m, n)):
				return {"conversation": m.get("conversation", ""), "milestone": m}
		elif check_all(_milestone_reqs(m, n)):
			return {"conversation": m.get("conversation", ""), "milestone": m}

	return {"conversation": a.get("base", {}).get("conversation", ""), "milestone": {}}


func _milestone_reqs(m: Dictionary, n: int) -> Array:
	var out: Array = (m.get("requires", []) as Array).duplicate()
	var cond: Dictionary = m.get("condition", {})
	for key: String in cond:
		match key:
			"value_at_least":
				if n < int(cond[key][1]):
					out.append({"type": "flag", "key": "__never__", "op": "is_true"})
			"meter_at_least":
				out.append({"type": "stat", "character": _activity_owner(m),
					"key": cond[key][0], "op": "gte", "value": cond[key][1]})
			"value_equals":
				out.append({"type": "flag", "key": String(cond[key][0]), "op": "is_true"})
	return out


func _activity_owner(m: Dictionary) -> String:
	for id: String in activities:
		for x: Dictionary in activities[id].get("milestones", []):
			if x == m:
				return activities[id].get("character", "")
	return ""


## Plays the next beat and increments the counter. Call this instead of
## play_conversation when the player repeats an activity.
func do_activity(activity_id: String) -> bool:
	var beat := next_beat(activity_id)
	if beat.is_empty() or beat.get("conversation", "") == "":
		return false

	var a: Dictionary = activities[activity_id]
	var key: String = a.get("counter_key", "activity.%s.count" % activity_id)
	stats[key] = float(stats.get(key, 0.0)) + 1.0
	flag_changed.emit(key, stats[key])

	var m: Dictionary = beat.get("milestone", {})
	var fx: Array = m.get("effects", []) if not m.is_empty() else a.get("base", {}).get("effects", [])
	for e: Dictionary in fx:
		_apply_effect(e)

	play_conversation(beat["conversation"])
	return true


## Applies one exported effect object.
func _apply_effect(e: Dictionary) -> void:
	match e.get("operation", ""):
		"add_meter":
			adjust_stat(e.get("character", ""), e.get("meter", ""), float(e.get("value", 0)))
		"set_flag":
			flags[e.get("key", "")] = e.get("value", true)
			flag_changed.emit(e.get("key", ""), flags[e.get("key", "")])
		"add_value":
			var k: String = e.get("key", "")
			_warn_undeclared(k)
			flags[k] = int(flags.get(k, 0)) + int(e.get("value", 0))
			flag_changed.emit(k, flags[k])
		"set_value":
			flags[e.get("key", "")] = e.get("value", true)
			flag_changed.emit(e.get("key", ""), flags[e.get("key", "")])
		"start_quest":
			if quests.has(e.get("value", "")):
				quest_stage[e["value"]] = 0
			flags["quest_%s_started" % e.get("value", "")] = true
		"unlock_phone_app":
			flags["unlocked_%s" % e.get("value", "")] = true
		"complete_quest":
			flags["quest_%s_done" % e.get("quest", "")] = true


## Activities the player could do right now.
func available_activities(location_id: String, day: String, block: String) -> Array[String]:
	var out: Array[String] = []
	for id: String in activities:
		var a: Dictionary = activities[id]
		if a.get("location", "") != "" and a.get("location", "") != location_id:
			continue
		var act: Dictionary = a.get("activation", {})
		var blocks: Array = act.get("blocks", [])
		var days: Array = act.get("days", [])
		if block != "" and not blocks.is_empty() and not blocks.has(block):
			continue
		if day != "" and not days.is_empty() and not days.has(day):
			continue
		out.append(id)
	return out


# ---------------------------------------------------------------- flags

## Accepts one or more effects separated by ";" — e.g.
##   "elena_reyes_hale.respect +1; unlocked_quests; trust -2"
## A dotted key moves a relationship stat; a bare word sets a flag true.
func set_flag(raw: String) -> void:
	for piece: String in raw.split(";", false):
		_apply_one(piece.strip_edges())


func _apply_one(effect: String) -> void:
	if effect == "":
		return

	var parts := effect.split(" ", false)
	var key := parts[0]

	if parts.size() == 1:
		_warn_undeclared(key)
		flags[key] = true
		flag_changed.emit(key, flags[key])
		return

	var delta := parts[1].to_int()
	_warn_undeclared(key)
	if key.contains("."):
		stats[key] = _clamp_key(key, float(stats.get(key, 0.0)) + float(delta))
		flag_changed.emit(key, stats[key])
		_check_chapter(key.get_slice(".", 0))
	else:
		flags[key] = int(flags.get(key, 0)) + delta
		flag_changed.emit(key, flags[key])


func advance_chapter(character_id: String) -> void:
	var level: int = int(chapters.get(character_id, 1))
	var total: int = characters.get(character_id, {}).get("chapters", []).size()
	chapters[character_id] = min(level + 1, max(total, 1))


## Everything you need to write into a save file.
func save_state() -> Dictionary:
	return {"flags": flags, "chapters": chapters, "seen": seen,
		"quest_stage": quest_stage, "stats": stats}


func load_state(state: Dictionary) -> void:
	flags = state.get("flags", {})
	chapters = state.get("chapters", {})
	seen = state.get("seen", {})
	quest_stage = state.get("quest_stage", {})
	stats = state.get("stats", {})
	# A save written before a key existed is missing it; seeding fills the gaps
	# without disturbing anything the player has already changed.
	_load_registry(registry)
