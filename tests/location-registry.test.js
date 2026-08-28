const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const gameRoot = path.resolve(root, '..', 'testgodot');
const context = vm.createContext({console});
const load = file => vm.runInContext(
  fs.readFileSync(path.join(root, file), 'utf8'), context, {filename:file});
const run = source => vm.runInContext(source, context);

load('js/00-state.js');
load('js/01-sheets.js');
load('js/02-places.js');
load('js/02a-game-locations.js');
load('js/03-schedule.js');
load('js/17-authored-in.js');

const bundled = JSON.parse(run('JSON.stringify(BUNDLED_LOCATION_PACKAGE)'));
const bundledSignature = run('BUNDLED_LOCATION_SIGNATURE');
const onePage = fs.readFileSync(path.join(root, 'scenewright.html'), 'utf8');
assert.ok(onePage.includes(`const BUNDLED_LOCATION_SIGNATURE='${bundledSignature}'`),
  'the one-page build must include the current registry snapshot');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const expectedBundle = manifest.map(file => `/* ---- ${path.basename(file)} ---- */\n` +
  fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n?/g, '\n').trimEnd()).join('\n\n');
const scriptOpen = onePage.lastIndexOf('<script>\n');
const scriptClose = onePage.lastIndexOf('\n</script>');
assert.ok(scriptOpen >= 0 && scriptClose > scriptOpen, 'the one-page JavaScript block must exist');
assert.equal(onePage.slice(scriptOpen + '<script>\n'.length, scriptClose), expectedBundle,
  'the one-page build must exactly match every modular JavaScript source');
const gamePath = path.join(gameRoot, 'content', 'world', 'all_locations.json');
if (fs.existsSync(gamePath)) {
  const canonical = JSON.parse(fs.readFileSync(gamePath, 'utf8'));
  assert.deepEqual(bundled, canonical, 'the bundled registry must exactly match the game file');
}

assert.equal(bundled.package_id, 'port_alder_all_locations');
assert.equal(bundled.districts.length, 10);
assert.equal(bundled.locations.length, 61);
assert.equal(bundled.locations.reduce((n, l) => n + (l.rooms || []).length, 0), 306);
assert.equal(Object.keys(bundled.legacy_aliases || {}).length, 15);
assert.equal(new Set(bundled.locations.map(l => l.id)).size, 61, 'location ids must be unique');
for (const location of bundled.locations) {
  assert.ok(location.id && location.name && location.district);
  assert.equal(new Set((location.rooms || []).map(room => room.id)).size,
    (location.rooms || []).length, `room ids must be unique inside ${location.id}`);
}

context.initialProject = {
  characters: [{
    id: 'legacy_npc', name: 'Legacy NPC', home: {location_id: 'hale_home'},
    schedule: {fixed_commitments: [
      {activity: 'clinic', location: 'st_maren_clinic_placeholder.reception'},
      {activity: 'unknown', location: 'removed_place.old_room'}
    ]}
  }],
  locations: [
    {id: 'old_registry', name: 'Old registry', tags: ['package'], rooms: []},
    {id: 'writers_retreat', name: 'Writer’s Retreat', district: 'alder_heights',
      tags: ['custom'], rooms: [{id: 'study', name: 'Study'}]},
    {id: 'hale_home', name: 'Outdated custom collision', tags: ['custom'], rooms: []}
  ],
  content: [{
    id: 'room_refs', type: 'quest', location: 'hale_home.living_room',
    stages: [
      {id: 'known', location: 'rowan_family_home.living_room'},
      {id: 'removed', location: 'removed_place.old_room'}
    ],
    questPlan: {eventDraft: {location: 'hale_home.kitchen'}}
  }], districts: [], travel: null, aliases: {}
};
run('P=initialProject');
const first = JSON.parse(run('JSON.stringify(syncBundledLocations())'));
assert.equal(first.updated, true);
assert.equal(first.deduped, 1, 'an official/custom id collision must not duplicate the place');
assert.equal(run("P.locations.filter(l=>l.tags?.includes('package')).length"), 61);
assert.equal(run("P.locations.filter(l=>l.tags?.includes('custom')).length"), 1);
assert.equal(run("P.locations.reduce((n,l)=>n+(l.tags?.includes('package')?(l.rooms||[]).length:0),0)"), 306);
assert.equal(run('DISTRICTS.length'), 10);
assert.equal(run('Object.keys(ALIASES).length'), 15);

assert.equal(run('P.content[0].location'), 'hale_home.living_room');
assert.equal(run('P.content[0].stages[0].location'), 'rowan_family_home.living_room');
assert.equal(run('P.content[0].stages[1].location'), 'removed_place.old_room',
  'removed references must remain visible for validation instead of being erased');
assert.equal(run('P.content[0].questPlan.eventDraft.location'), 'hale_home.kitchen');
assert.equal(run('P.characters[0].schedule.fixed_commitments[0].location'),
  'st_maren_community_clinic.reception');
assert.equal(run('P.characters[0].schedule.fixed_commitments[1].location'),
  'removed_place.old_room');

assert.equal(run("resolvePlaceRef('hale_home.living_room')"), 'hale_home.living_room');
assert.equal(run("resolvePlaceRef('Hale Family Home — Living Room')"), 'hale_home.living_room');
assert.equal(run("resolvePlaceRef('living_room')"), null,
  'a bare repeated room name must never guess a parent');
assert.equal(run("resolvePlaceRef('st_maren_clinic_placeholder.reception')"),
  'st_maren_community_clinic.reception');
assert.equal(run("placeName('hale_home.living_room')"), 'Hale Family Home — Living Room');
assert.match(run("placeOptions('removed_place.old_room')"), /Unknown — removed_place\.old_room/);
context.aliasSheet = {id: 'alias_npc', conversations: [{id: 'clinic_alias_scene',
  activation: {location: 'st_maren_clinic_placeholder.reception'}, start_node: 'hello',
  nodes: {hello: {speaker: 'alias_npc', line: 'Hello.'}}}]};
run('importAuthored(aliasSheet)');
assert.equal(run("P.content.find(c=>c.id==='clinic_alias_scene').location"),
  'st_maren_community_clinic.reception');
assert.equal(run("P.locations.filter(l=>l.tags?.includes('package')).length"), 61);
run("P.content=P.content.filter(c=>c.id!=='clinic_alias_scene')");
assert.equal(run("loc('cypress_hall_dorm').housing.monthly_rent"), 950);
assert.equal(run("loc('forge_fitness').named_npcs[0]"), 'rachel_morgan');
assert.equal(run("loc('st_maren_sexual_health').privacy"), 'private_health_record');
assert.equal(run("loc('harbor_companion_cooperative').content_rules.length"), 4);
context.locationExtension = {format_version: 1, package_id: 'scenewright_custom_locations',
  reference_format: 'location_id.room_id', locations: [
    {id: 'writers_retreat', name: 'Updated Writer’s Retreat', district: 'alder_heights',
      rooms: [{id: 'studio', name: 'Studio'}]},
    {id: 'hale_home', name: 'Must Not Replace Hale Home', rooms: []}
  ]};
const extensionResult = JSON.parse(run('JSON.stringify(importLocations(locationExtension))'));
assert.equal(extensionResult.custom, true);
assert.deepEqual(extensionResult.collisions, ['hale_home']);
assert.equal(run("P.locations.filter(l=>l.tags?.includes('package')).length"), 61);
assert.equal(run("P.locations.filter(l=>l.tags?.includes('custom')).length"), 1);
assert.equal(run("loc('hale_home').name"), 'Hale Family Home');
assert.equal(run("loc('writers_retreat').name"), 'Updated Writer’s Retreat');
assert.equal(run('P.locationPackage.source'), 'bundled');
run(`
  P.content.push({id:'custom_place_refs',type:'quest',location:'writers_retreat.studio',
    stages:[{location:'writers_retreat.studio'}],
    questPlan:{eventDraft:{location:'writers_retreat.studio'}}});
  P.characters.push({id:'custom_resident',name:'Custom Resident',
    home:{location_id:'writers_retreat',residence_id:'writers_retreat'},
    schedule:{fixed_commitments:[{location:'writers_retreat.studio'}]}});
  renameLocationId(loc('writers_retreat'),'story_retreat');
`);
assert.equal(run("P.content.find(c=>c.id==='custom_place_refs').location"), 'story_retreat.studio');
assert.equal(run("P.content.find(c=>c.id==='custom_place_refs').stages[0].location"), 'story_retreat.studio');
assert.equal(run("P.content.find(c=>c.id==='custom_place_refs').questPlan.eventDraft.location"), 'story_retreat.studio');
assert.equal(run("P.characters.find(c=>c.id==='custom_resident').home.location_id"), 'story_retreat');
assert.equal(run("P.characters.find(c=>c.id==='custom_resident').schedule.fixed_commitments[0].location"), 'story_retreat.studio');
assert.equal(run("renameLocationId(loc('story_retreat'),'hale_home')"), 'story_retreat');
run("P.content=P.content.filter(c=>c.id!=='custom_place_refs');P.characters=P.characters.filter(c=>c.id!=='custom_resident')");
assert.equal(JSON.parse(run('JSON.stringify(syncBundledLocations())')).updated, false,
  'reopening an already-current registry must be idempotent');

// A damaged/old browser registry refreshes without losing custom places or notes.
run("loc('hale_home').name='Old Hale name'; loc('hale_home').notes='Writer note'; \
  loc('hale_home').rooms=loc('hale_home').rooms.filter(r=>r.id!=='living_room')");
const repaired = JSON.parse(run('JSON.stringify(syncBundledLocations())'));
assert.equal(repaired.updated, true);
assert.equal(run("loc('hale_home').name"), 'Hale Family Home');
assert.equal(run("roomOf('hale_home.living_room').name"), 'Living Room');
assert.equal(run("loc('hale_home').notes"), 'Writer note');
assert.equal(run("!!loc('story_retreat')"), true);

// Fresh project loading restores its own registry globals before the next save.
context.savedProject = JSON.parse(run('JSON.stringify(P)'));
run("DISTRICTS=[{id:'stale'}];TRAVEL={stale:true};ALIASES={stale:'value'};restoreProject(savedProject)");
assert.equal(run('DISTRICTS.length'), 10);
assert.equal(run('Object.keys(ALIASES).length'), 15);
assert.equal(run("ALIASES.st_maren_clinic_placeholder"), 'st_maren_community_clinic');
assert.equal(run("P.districts[0].id"), bundled.districts[0].id);

context.healthyProject = JSON.parse(run('JSON.stringify(P)'));
run(`
  P={characters:[],content:[],districts:[],travel:null,aliases:{},
    locationPackage:{id:'scenewright_custom_locations',source:'imported'},
    locations:[{id:'legacy_custom_place',name:'Legacy Custom Place',tags:['package'],rooms:[]}]};
  DISTRICTS=[];TRAVEL=null;ALIASES={};syncBundledLocations();
`);
assert.equal(run("P.locations.filter(l=>l.tags?.includes('package')).length"), 61);
assert.equal(run("loc('legacy_custom_place').tags[0]"), 'custom');
assert.equal(run("loc('hale_home').name"), 'Hale Family Home');
run('restoreProject(healthyProject)');

// Importing real character sheets after the registry must not create activity-name
// pseudo-locations such as watching_tv or a second Hale home.
if (fs.existsSync(path.join(gameRoot, 'characters'))) {
  context.gameSheets = fs.readdirSync(path.join(gameRoot, 'characters'))
    .filter(name => name.endsWith('.character'))
    .map(name => JSON.parse(fs.readFileSync(path.join(gameRoot, 'characters', name), 'utf8')));
  context.elenaSheet = context.gameSheets.find(sheet => sheet.id === 'elena_reyes_hale');
  context.danielSheet = context.gameSheets.find(sheet => sheet.id === 'daniel_hale');
  run(`
    function scheduleSnapshot(character){
      return JSON.stringify(Object.entries(scheduleGrid(character)).map(([key,value])=>
        [key,value.activity,value.location,value.unavailable,value._meta]).sort());
    }
    globalThis.SCHEDULE_ROUND_TRIP_FAILURES=gameSheets.filter(sheet=>{
      const rebuilt=JSON.parse(JSON.stringify(sheet));
      rebuilt.schedule=rebuilt.schedule||{};
      rebuilt.schedule.fixed_commitments=gridToCommitments(scheduleGrid(sheet),sheet);
      return scheduleSnapshot(sheet)!==scheduleSnapshot(rebuilt);
    }).map(sheet=>sheet.id);
  `);
  assert.deepEqual(Array.from(context.SCHEDULE_ROUND_TRIP_FAILURES), [],
    'editing a schedule must preserve every exact day/block cell');
  const elenaScheduleRoundTrip = JSON.parse(run(
    'JSON.stringify(gridToCommitments(scheduleGrid(elenaSheet),elenaSheet))'));
  const danielScheduleRoundTrip = JSON.parse(run(
    'JSON.stringify(gridToCommitments(scheduleGrid(danielSheet),danielSheet))'));
  assert.deepEqual(elenaScheduleRoundTrip, context.elenaSheet.schedule.fixed_commitments);
  assert.deepEqual(danielScheduleRoundTrip, context.danielSheet.schedule.fixed_commitments);
  assert.equal(run(`gridToCommitments(scheduleGrid(gameSheets.find(s=>s.id==='hannah_brooks')),
    gameSheets.find(s=>s.id==='hannah_brooks')).some(f=>f.days.some(d=>d.startsWith('rotation_day_')))`), true);
  assert.equal(run("scheduleGrid(elenaSheet)['friday|evening'].location"), 'hale_home.living_room');
  run(`
    const editedSchedule=scheduleGrid(elenaSheet);editedSchedule['friday|evening'].unavailable=true;
    globalThis.EDITED_TV_COMMITMENT=gridToCommitments(editedSchedule,elenaSheet).find(f=>
      f.days.includes('friday')&&f.blocks.includes('evening'));
  `);
  assert.equal(context.EDITED_TV_COMMITMENT.label, 'Watching TV in the living room');
  assert.equal(context.EDITED_TV_COMMITMENT.home_placement.room, 'living_room');
  assert.deepEqual(Array.from(context.EDITED_TV_COMMITMENT.home_placement.position), [340, 590]);
  run(`
    const clearedRoomSchedule=scheduleGrid(elenaSheet);
    clearedRoomSchedule['friday|evening'].location='hale_home';
    const clearedRoomCommitments=gridToCommitments(clearedRoomSchedule,elenaSheet);
    globalThis.CLEARED_FRIDAY_HOME=clearedRoomCommitments.find(f=>
      f.days.includes('friday')&&f.blocks.includes('evening'));
    globalThis.KEPT_SATURDAY_ROOM=clearedRoomCommitments.find(f=>
      f.days.includes('saturday')&&f.blocks.includes('evening'));
  `);
  assert.equal(Object.hasOwn(context.CLEARED_FRIDAY_HOME, 'home_placement'), false,
    'choosing the general home must clear an old room placement');
  assert.equal(context.KEPT_SATURDAY_ROOM.home_placement.room, 'living_room');
  assert.deepEqual(Array.from(context.KEPT_SATURDAY_ROOM.home_placement.position), [340, 590]);
  run(`
    P={characters:[],locations:[],content:[],districts:[],travel:null,aliases:{}};
    syncBundledLocations();gameSheets.forEach(sheet=>{importSheet(sheet);importAuthored(sheet);});
    globalThis.REGISTRY_FIRST_LOCATION_SNAPSHOT=JSON.stringify(P.content.map(c=>
      [c.type,c.id,c.location,(c.stages||[]).map(s=>s.location||'')]).sort());
  `);
  assert.equal(run('gameSheets.length'), 15);
  assert.equal(run('P.locations.length'), 61);
  assert.equal(run("P.locations.some(l=>['watching_tv','alder_heights','hale_family_home'].includes(l.id))"), false);
  assert.equal(run("P.characters.find(c=>c.id==='elena_reyes_hale').home.location_id"), 'hale_home');
  assert.equal(run("P.content.find(c=>c.id==='marcus_after_screening').location"),
    'harborlight_cinema.lobby');

  run(`
    P={characters:[],locations:[],content:[],districts:[],travel:null,aliases:{}};
    gameSheets.forEach(sheet=>{importSheet(sheet);importAuthored(sheet);});syncBundledLocations();
    globalThis.CHARACTER_FIRST_LOCATION_SNAPSHOT=JSON.stringify(P.content.map(c=>
      [c.type,c.id,c.location,(c.stages||[]).map(s=>s.location||'')]).sort());
  `);
  assert.equal(run('P.locations.length'), 61,
    'character-first and registry-first imports must produce the same canonical places');
  assert.equal(run("P.locations.some(l=>['watching_tv','alder_heights','hale_family_home'].includes(l.id))"), false);
  assert.equal(run("P.content.find(c=>c.id==='marcus_after_screening').location"),
    'harborlight_cinema.lobby');
  assert.equal(context.CHARACTER_FIRST_LOCATION_SNAPSHOT, context.REGISTRY_FIRST_LOCATION_SNAPSHOT);
}

run(`
  function countLines(){ return 1; }
  function contentAvailability(){ return []; }
  function walkAll(){}
  function flagRegistry(){ return {}; }
  function links(){ return []; }
  function missingRefs(){ return []; }
  function coverage(){ return {}; }
`);
load('js/15b-validate.js');
run(`
  P.characters=[{id:'room_tester',name:'Room Tester',profile:{},schedule:{fixed_commitments:[
    {activity:'work',location:'hale_home.missing_schedule_room'}
  ]}}];
  P.locations.push({id:'Bad Custom ID',name:'',district:'missing_district',tags:['custom'],rooms:[
    {id:'same_room',name:'First'},{id:'same_room',name:'Second'},{id:'',name:''}
  ]});
  P.content=[{uid:'q1',id:'bad_rooms',type:'quest',title:'Bad rooms',character:'room_tester',
    cast:['room_tester'],location:'hale_home',requires:[],start:true,
    stages:[{id:'stage_1',title:'Stage',location:'hale_home.missing_stage_room',requires:[],nodes:[]}],
    questPlan:{eventDraft:{location:'hale_home.missing_event_room'}}}];
  globalThis.LOCATION_VALIDATION_MESSAGES=validate().map(issue=>issue.msg);
`);
const validationMessages = context.LOCATION_VALIDATION_MESSAGES;
assert.ok(validationMessages.some(message => message.includes('missing_stage_room')));
assert.ok(validationMessages.some(message => message.includes('missing_event_room')));
assert.ok(validationMessages.some(message => message.includes('missing_schedule_room')));
assert.ok(validationMessages.some(message => message.includes('Bad Custom ID') && message.includes('lowercase')));
assert.ok(validationMessages.some(message => message.includes('unknown district')));
assert.ok(validationMessages.some(message => message.includes('share the id "same_room"')));
assert.ok(validationMessages.some(message => message.includes('has no id')));

console.log('location registry regression tests passed');
