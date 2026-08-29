const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const context=vm.createContext({console});
const load=file=>vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});
const run=source=>vm.runInContext(source,context);

load('js/00-state.js');
load('js/01-sheets.js');
load('js/01a-game-characters.js');
load('js/02-places.js');
load('js/02a-game-locations.js');

run(`
  P={characters:[],locations:[],content:[],districts:[],travel:null,aliases:{},
    dismissedBundledCharacters:[]};
  syncBundledLocations();syncBundledCharacters();
  globalThis.RESIDENCE_PACKAGE_REPORT=P.characters.map(character=>{
    const home=characterHomeLocation(character);
    return {character:character.id,home:home?.id||'',rooms:home?.rooms?.length||0,
      entrance:home?.outside_room||'',resident:!!home?.residents?.includes(character.id)};
  });
`);

const packageReport=JSON.parse(JSON.stringify(context.RESIDENCE_PACKAGE_REPORT));
assert.equal(packageReport.length,15);
assert.equal(packageReport.every(row=>row.home&&row.rooms>0&&row.resident),true,
  'every bundled NPC must resolve to a room-mapped residence that lists them as a resident: '+
    JSON.stringify(packageReport.filter(row=>!row.home||!row.rooms||!row.resident)));
assert.equal(packageReport.filter(row=>row.home!=='hale_home').every(row=>row.entrance),true,
  'registry-driven NPC homes must declare an entrance');
assert.equal(new Set(packageReport.map(row=>row.home)).size,13);
assert.equal(run("P.characters.find(character=>character.id==='claire_donovan').home.district"),'Greyport',
  'initial bundled sync preserves writer-facing district names');
assert.equal(run("P.characters.find(character=>character.id==='claire_donovan').home.residence_id"),undefined,
  'initial bundled sync does not add a legacy residence_id');

assert.equal(run("residenceEntranceId(loc('hale_home'))"),'front_yard');
assert.equal(run("residenceRoomNavigation(loc('hale_home'),roomOf('hale_home.entryway')).right"),'front_yard');

run(`
  const emma=P.characters.find(character=>character.id==='emma_rowan');
  const originalHome=characterHomeLocation(emma);
  originalHome.discovery.hidden_until_discovered=false;
  rememberResidenceOverride(originalHome);
  setCharacterHomeLocation(emma,'hannah_medical_district_apartment');
  const restored=JSON.parse(JSON.stringify(P));
  restoreProject(restored);
  globalThis.RESTORED_RESIDENCE={
    hidden:loc('rowan_family_home').discovery.hidden_until_discovered,
    oldResidents:loc('rowan_family_home').residents.slice(),
    newResidents:loc('hannah_medical_district_apartment').residents.slice(),
    home:P.characters.find(character=>character.id==='emma_rowan').home.location_id
  };
`);
const restoredResidence=JSON.parse(JSON.stringify(context.RESTORED_RESIDENCE));
assert.equal(restoredResidence.hidden,false,'residence visibility override must survive a registry refresh');
assert.equal(restoredResidence.oldResidents.includes('emma_rowan'),false);
assert.equal(restoredResidence.newResidents.includes('emma_rowan'),true);
assert.equal(restoredResidence.home,'hannah_medical_district_apartment');

run(`
  P={characters:[],content:[],districts:[],travel:null,aliases:{},dismissedBundledCharacters:[],locations:[
    {id:'old_home',name:'Old Home',district:'old_district',type:'npc_residence',residents:['test_npc'],
      outside_room:'entry',rooms:[{id:'entry',name:'Entry'},{id:'bedroom',name:'Bedroom'}]},
    {id:'new_home',name:'New Home',district:'new_district',type:'npc_residence',residents:[],
      outside_room:'front_door',rooms:[{id:'front_door',name:'Front Door'},{id:'den',name:'Den'}]}
  ]};
  const movingCharacter={id:'test_npc',name:'Test NPC',home:{location_id:'old_home',district:'old_district',
    residence:'Old Home',household:['old_roommate']},schedule:{fixed_commitments:[{
      activity:'home_project',location:'old_home',home_placement:{room:'bedroom'},days:['monday'],blocks:['evening']
    }]}};
  P.characters.push(movingCharacter);
  setCharacterHomeLocation(movingCharacter,'new_home');
  globalThis.MOVED_RESIDENCE={character:movingCharacter,old:P.locations[0],next:P.locations[1]};
`);

const moved=JSON.parse(JSON.stringify(context.MOVED_RESIDENCE));
assert.equal(moved.character.home.location_id,'new_home');
assert.equal(moved.character.home.residence,'New Home');
assert.equal(moved.character.home.district,'new_district');
assert.equal(moved.old.residents.includes('test_npc'),false);
assert.equal(moved.next.residents.includes('test_npc'),true);
assert.equal(moved.character.schedule.fixed_commitments[0].location,'new_home');
assert.equal(moved.character.schedule.fixed_commitments[0].home_placement.room,'bedroom',
  'an invalid old room stays visible for the writer to repair instead of being silently discarded');

run(`
  importSheet({id:'imported_npc',display_name:'Imported NPC',profile:{age:25},
    home:{location_id:'new_home',district:'New District Name',residence:'Writer Home Name',household:[]}});
  globalThis.IMPORTED_HOME_LINK=P.locations.find(location=>location.id==='new_home').residents.slice();
  globalThis.IMPORTED_HOME_LABELS=JSON.stringify(P.characters.find(character=>character.id==='imported_npc').home);
`);
assert.equal(Array.from(context.IMPORTED_HOME_LINK).includes('imported_npc'),true);
const importedHomeLabels=JSON.parse(context.IMPORTED_HOME_LABELS);
assert.equal(importedHomeLabels.district,'New District Name',
  'importing a sheet preserves its writer-facing district label');
assert.equal(importedHomeLabels.residence,'Writer Home Name',
  'importing a sheet preserves its writer-facing residence label');

console.log('residence authoring regression tests passed');
