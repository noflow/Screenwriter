const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..'),context=vm.createContext({console});
const load=file=>vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});
const run=source=>vm.runInContext(source,context);

load('js/00-state.js');
load('js/01-sheets.js');
load('js/02-places.js');
load('js/02a-game-locations.js');

run(`{
  P={characters:[],locations:[],content:[],districts:[],travel:null,aliases:{},
    dismissedBundledCharacters:[],residence_overrides:{}};
  syncBundledLocations();
  const rowan=loc('rowan_family_home'),layout=autoRoomMapLayout(rowan);
  globalThis.ROWAN_MAP={roomCount:rowan.rooms.length,layout,
    errors:roomMapIssues(rowan).filter(issue=>issue.severity==='error')};
}`);
const rowanMap=JSON.parse(JSON.stringify(context.ROWAN_MAP));
assert.equal(Object.keys(rowanMap.layout).length,rowanMap.roomCount);
assert.equal(new Set(Object.values(rowanMap.layout).map(point=>point.x+','+point.y)).size,rowanMap.roomCount);
assert.deepEqual(rowanMap.errors,[]);

run(`{
  const broken={id:'broken_home',name:'Broken Home',outside_room:'entry',rooms:[
    {id:'entry',name:'Entry',navigation:{up:'missing_room'}}]};
  globalThis.BROKEN_MAP_ISSUES=roomMapIssues(broken);
}`);
assert(context.BROKEN_MAP_ISSUES.some(issue=>issue.severity==='error'&&issue.message.includes('missing_room')));

run(`{
  P={characters:[],content:[],districts:[],travel:null,aliases:{},residence_overrides:{},locations:[{
    id:'studio_home',name:'Studio Home',district:'alder_heights',type:'apartment',tags:['custom'],
    outside_room:'old_bedroom',rooms:[
      {id:'old_bedroom',name:'Old Bedroom',access:'private',actions:['sleep'],navigation:{right:'hall'}},
      {id:'hall',name:'Hall',access:'shared',actions:[],navigation:{left:'old_bedroom'}}
    ]
  }]};
  const resident={id:'resident',name:'Resident',home:{location_id:'studio_home'},
    schedule:{fixed_commitments:[{location:'studio_home.old_bedroom',home_placement:{room:'old_bedroom'}}]},
    home_routine:{default_by_block:{evening:{room:'old_bedroom'}},overrides:[{room:'old_bedroom'}]}};
  P.characters=[resident];P.content=[{type:'quest',id:'room_story',location:'studio_home.old_bedroom',
    stages:[{location:'studio_home.old_bedroom'}],questPlan:{eventDraft:{location:'studio_home.old_bedroom'}}}];
  const home=loc('studio_home'),bedroom=roomOf('studio_home.old_bedroom');
  globalThis.RENAMED_ROOM=renameRoomId(home,bedroom,'bedroom');
  globalThis.RENAME_RESULT={home,content:P.content[0],resident};
}`);
const renameResult=JSON.parse(JSON.stringify(context.RENAME_RESULT));
assert.equal(context.RENAMED_ROOM,'bedroom');
assert.equal(renameResult.home.outside_room,'bedroom');
assert.equal(renameResult.home.rooms[1].navigation.left,'bedroom');
assert.equal(renameResult.content.location,'studio_home.bedroom');
assert.equal(renameResult.content.stages[0].location,'studio_home.bedroom');
assert.equal(renameResult.content.questPlan.eventDraft.location,'studio_home.bedroom');
assert.equal(renameResult.resident.schedule.fixed_commitments[0].location,'studio_home.bedroom');
assert.equal(renameResult.resident.schedule.fixed_commitments[0].home_placement.room,'bedroom');
assert.equal(renameResult.resident.home_routine.default_by_block.evening.room,'bedroom');
assert.equal(renameResult.resident.home_routine.overrides[0].room,'bedroom');

run(`{
  const home=loc('studio_home'),bedroom=home.rooms.find(room=>room.id==='bedroom'),hall=home.rooms.find(room=>room.id==='hall');
  delete bedroom.navigation.right;delete hall.navigation.left;
  setRoomExit(home,bedroom,'right','hall',{addReturn:true});
  globalThis.RETURN_ADDED=hall.navigation.left;
  setRoomExit(home,bedroom,'right','',{addReturn:true});
  globalThis.RETURN_REMOVED=Object.prototype.hasOwnProperty.call(hall.navigation,'left');
  const added=addLocationRoom(home,'Bathroom');
  globalThis.NEW_ROOM={id:added.id,layout:home.editor_layout[added.id]};
}`);
assert.equal(context.RETURN_ADDED,'bedroom');
assert.equal(context.RETURN_REMOVED,false);
assert.equal(context.NEW_ROOM.id,'bathroom');
assert.equal(Number.isFinite(context.NEW_ROOM.layout.x),true);

run(`{
  P={characters:[],locations:[],content:[],districts:[],travel:null,aliases:{},
    dismissedBundledCharacters:[],residence_overrides:{}};syncBundledLocations();
  const home=loc('rowan_family_home'),room=home.rooms.find(item=>item.id==='emma_bedroom');
  room.actions.push('write_letter');room.access='friendship_permission';autoRoomMapLayout(home);
  rememberResidenceOverride(home,['rooms','editor_layout']);
  const project=JSON.parse(JSON.stringify(P));restoreProject(project);
  const restored=loc('rowan_family_home'),restoredRoom=restored.rooms.find(item=>item.id==='emma_bedroom');
  globalThis.OVERRIDE_RESULT={actions:restoredRoom.actions,access:restoredRoom.access,
    layout:restored.editor_layout,override:P.residence_overrides.rowan_family_home};
}`);
const overrideResult=JSON.parse(JSON.stringify(context.OVERRIDE_RESULT));
assert(overrideResult.actions.includes('write_letter'));
assert.equal(overrideResult.access,'friendship_permission');
assert.equal(Object.keys(overrideResult.layout).length,6);
assert.equal(Array.isArray(overrideResult.override.rooms),true);

run(`{
  const hale=loc('hale_home');
  globalThis.HALE_MATERIALIZED=materializeSpecialResidenceLayout(hale);
  globalThis.HALE_RESULT={outside:hale.outside_room,
    entryRight:hale.rooms.find(room=>room.id==='entryway').navigation.right,
    roomCount:hale.rooms.filter(room=>room.navigation).length};
  globalThis.EXPORTED_HOME=locationExportRecord(loc('rowan_family_home'));
}`);
assert.equal(context.HALE_MATERIALIZED,true);
assert.equal(context.HALE_RESULT.outside,'front_yard');
assert.equal(context.HALE_RESULT.entryRight,'front_yard');
assert.equal(context.HALE_RESULT.roomCount,14);
assert.equal(context.EXPORTED_HOME.rooms.find(room=>room.id==='emma_bedroom').navigation.down,'living_room');

console.log('visual room-map editor regression tests passed');
