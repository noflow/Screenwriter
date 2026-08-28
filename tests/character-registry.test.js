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
load('js/01a-game-characters.js');
load('js/02-places.js');
load('js/02a-game-locations.js');
load('js/03-schedule.js');
load('js/17-authored-in.js');

const bundled = JSON.parse(run('JSON.stringify(BUNDLED_CHARACTER_SHEETS)'));
assert.equal(bundled.length, 15);
assert.equal(new Set(bundled.map(sheet => sheet.id)).size, 15);
assert.ok(bundled.every(sheet => sheet.id && sheet.display_name && sheet.profile));

const characterDirectory = path.join(gameRoot, 'characters');
if (fs.existsSync(characterDirectory)) {
  const canonical = fs.readdirSync(characterDirectory)
    .filter(name => name.endsWith('.character')).sort()
    .map(name => JSON.parse(fs.readFileSync(path.join(characterDirectory, name), 'utf8')));
  assert.deepEqual(bundled, canonical,
    'the bundled character snapshot must exactly match all game character files');
}

run(`
  P={characters:[],locations:[],content:[],districts:[],travel:null,aliases:{},
    dismissedBundledCharacters:[]};
  syncBundledLocations();
  globalThis.FRESH_SYNC=syncBundledCharacters();
  globalThis.FRESH_PROJECT=JSON.stringify(P);
`);
assert.equal(context.FRESH_SYNC.updated, true);
assert.equal(context.FRESH_SYNC.added.length, 15);
assert.equal(run('P.characters.length'), 15);
assert.equal(run('new Set(P.characters.map(character=>character.id)).size'), 15);
assert.equal(run("P.characters.find(character=>character.id==='elena_reyes_hale').name"),
  'Elena Reyes-Hale');
assert.equal(run("P.content.some(item=>item.type==='quest'&&item.id==='one_last_summer_movie')"), true);
assert.equal(run("P.content.some(item=>item.type==='conversation'&&item.id==='emma_alder_bay_walk')"), true);
assert.equal(run("P.content.some(item=>item.type==='activity'&&item.id==='weekend_tv_with_mom')"), true);
assert.equal(run('allTextMessages().length'), 10);
assert.equal(run('P.characterPackage.count'), 15);
assert.equal(run('P.characterPackage.signature'), run('BUNDLED_CHARACTER_SIGNATURE'));

// Existing characters and story items win over automatic startup additions.
run(`
  P={characters:[
      {id:'emma_rowan',name:'Writer-edited Emma',profile:{role:'custom_edit'}},
      {id:'daniel_hale',name:'Generated stub',profile:{},_stub:true},
      {id:'custom_npc',name:'Custom NPC',profile:{role:'original'}}
    ],locations:[],content:[
      {uid:'writer_movie',type:'quest',id:'one_last_summer_movie',title:'Writer version',
        premise:'Do not replace this quest.',stages:[]}
    ],districts:[],travel:null,aliases:{},dismissedBundledCharacters:[]};
  syncBundledLocations();
  globalThis.PRESERVING_SYNC=syncBundledCharacters();
  globalThis.PRESERVING_SNAPSHOT=JSON.stringify(P);
  globalThis.SECOND_SYNC=syncBundledCharacters();
`);
assert.equal(context.PRESERVING_SYNC.added.length, 13);
assert.deepEqual(Array.from(context.PRESERVING_SYNC.replacedStubs), ['daniel_hale']);
assert.equal(run('P.characters.length'), 16);
assert.equal(run("P.characters.find(character=>character.id==='emma_rowan').name"), 'Writer-edited Emma');
assert.equal(run("P.characters.find(character=>character.id==='daniel_hale').display_name"), 'Daniel Hale');
assert.equal(run("P.characters.find(character=>character.id==='custom_npc').name"), 'Custom NPC');
assert.equal(run("P.content.find(item=>item.type==='quest'&&item.id==='one_last_summer_movie').premise"),
  'Do not replace this quest.');
assert.equal(context.SECOND_SYNC.updated, false);
assert.equal(run('JSON.stringify(P)'), context.PRESERVING_SNAPSHOT,
  'running bundled-character sync twice must not alter an existing project');

// Removing a bundled NPC is an intentional choice; manual import restores it.
run(`
  const oliviaIndex=P.characters.findIndex(character=>character.id==='olivia_price');
  P.characters.splice(oliviaIndex,1);P.dismissedBundledCharacters.push('olivia_price');
  globalThis.DISMISSED_SYNC=syncBundledCharacters();
`);
assert.equal(run("P.characters.some(character=>character.id==='olivia_price')"), false);
assert.equal(context.DISMISSED_SYNC.updated, false);
run("importSheet(JSON.parse(JSON.stringify(BUNDLED_CHARACTER_SHEETS.find(sheet=>sheet.id==='olivia_price'))))");
assert.equal(run("P.characters.some(character=>character.id==='olivia_price')"), true);
assert.equal(run("P.dismissedBundledCharacters.includes('olivia_price')"), false);

run(`
  function countLines(){ return 1; }
  function contentAvailability(){ return []; }
  function customStatDefs(){ return []; }
  function statDefinition(){ return null; }
  function walkAll(){}
  function flagRegistry(){ return {}; }
  function links(){ return []; }
  function missingRefs(){ return []; }
  function coverage(){ return {}; }
  P=JSON.parse(FRESH_PROJECT);
`);
load('js/15b-validate.js');
run("globalThis.BUNDLED_VALIDATION_ERRORS=validate().filter(issue=>issue.sev==='err').map(issue=>issue.msg)");
assert.deepEqual(Array.from(context.BUNDLED_VALIDATION_ERRORS), [],
  'the built-in game characters and their authored content should open without validation errors');

console.log('character registry regression tests passed');
