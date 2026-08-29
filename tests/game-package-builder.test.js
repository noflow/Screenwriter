const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const context = vm.createContext({console, TextEncoder, crypto:crypto.webcrypto});
const load = file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, {filename:file});
const run = source => vm.runInContext(source, context);

run(`
  function orderedJson(value){
    if(Array.isArray(value))return value.map(orderedJson);
    if(value&&typeof value==='object')return Object.keys(value).sort().reduce((out,key)=>{
      out[key]=orderedJson(value[key]);return out;
    },{});
    return value;
  }
  function slug(value){return String(value||'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'');}
  function pretty(value){return String(value||'').replace(/_/g,' ');}
  const BUNDLED_CHARACTER_SHEETS=[
    {format_version:1,id:'alexa',display_name:'Alexa'},
    {format_version:1,id:'beth',display_name:'Beth'},
    {format_version:1,id:'removed_npc',display_name:'Removed NPC'}
  ];
  const BUNDLED_CHARACTER_SIGNATURE='characters123';
  const BUNDLED_LOCATION_SIGNATURE='locations123';
  const BUNDLED_LOCATION_PACKAGE={format_version:1,package_id:'port_alder_all_locations',
    reference_format:'location_id.room_id',districts:[{id:'old_town'}],travel_rules:{},legacy_aliases:{},
    locations:[{id:'home',name:'Home',district:'old_town',type:'house',residents:['alexa'],
      rooms:[{id:'entry',name:'Entry',access:'shared'}]}]};
  let DISTRICTS=[{id:'old_town'}],TRAVEL={},ALIASES={};
  let P={characters:[
      {id:'alexa',name:'Alexa'},
      {id:'beth',name:'Beth Updated'},
      {id:'new_npc',name:'New NPC'}
    ],locations:[{id:'home',name:'Home',district:'old_town',type:'house',residents:['alexa'],
      background:'bg_home',tags:['package'],editor_layout:{entry:{x:1,y:2}},
      rooms:[{id:'entry',name:'Entry',access:'shared'}]}]};
  function npcs(){return P.characters;}
  function sheetOut(character){return {format_version:1,id:character.id,display_name:character.name};}
  function customLocationsOut(){return {format_version:1,package_id:'scenewright_custom_locations',
    reference_format:'location_id.room_id',locations:P.locations.filter(location=>location.tags.includes('custom'))};}
`);
load('js/19a-package-builder.js');

const candidates = JSON.parse(run('JSON.stringify(gamePackageCandidates({characters:true,world:true}))'));
assert.equal(candidates.find(file=>file.id==='alexa').status, 'unchanged');
assert.equal(candidates.find(file=>file.id==='beth').status, 'updated');
assert.equal(candidates.find(file=>file.id==='new_npc').status, 'added');
assert.equal(candidates.find(file=>file.kind==='world').status, 'unchanged');
assert.equal(candidates.find(file=>file.kind==='world').content.locations[0].background, undefined);
assert.equal(candidates.find(file=>file.kind==='world').content.locations[0].editor_layout, undefined);

const changed = JSON.parse(run("JSON.stringify(gamePackagePlan({scope:'changed',characters:true,world:true}))"));
assert.deepEqual(changed.files.map(file=>file.id), ['beth','new_npc']);
assert.deepEqual(changed.removed_paths, []);

const full = JSON.parse(run("JSON.stringify(gamePackagePlan({scope:'full',characters:true,world:true}))"));
assert.equal(full.files.length, 4);
assert.deepEqual(full.removed_paths, ['characters/removed_npc.character']);

run(`
  globalThis.BUILT_PACKAGE_PROMISE=finalizeGamePackage(
    gamePackagePlan({scope:'changed',characters:true,world:true}),
    {package_id:'test_release',version:'4',notes:'Regression build'},
    {blockers:[],warnings:[{message:'draft'}]}
  );
`);

(async()=>{
  const built=await context.BUILT_PACKAGE_PROMISE;
  assert.equal(built.format, 'scenewright.game_package');
  assert.equal(built.target, 'port_alder_godot');
  assert.equal(built.package_id, 'test_release');
  assert.equal(built.version, 4);
  assert.equal(built.files.length, 2);
  assert.equal(built.validation.warnings, 1);
  assert.ok(built.files.every(file=>/^[a-f0-9]{64}$/.test(file.checksum)));
  assert.ok(built.files.every(file=>JSON.parse(file.content_text).id===file.id));
  assert.match(built.manifest.checksum,/^[a-f0-9]{64}$/);
  console.log('game package builder regression tests passed');
})().catch(error=>{console.error(error);process.exitCode=1;});
