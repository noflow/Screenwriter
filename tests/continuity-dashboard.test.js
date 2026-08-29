const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const context = vm.createContext({console});
const load = file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, {filename:file});
const run = source => vm.runInContext(source, context);

run(`
  function pretty(value){return String(value||'').replace(/_/g,' ');}
  function locPart(value){return String(value||'').split('.')[0];}
  function roomPart(value){return String(value||'').split('.')[1]||'';}
  function isPlayer(character){return character&&character.id==='player';}
  function npcs(){return P.characters;}
  function gameReady(character){return character;}
  function esc(value){return String(value||'');}
  function $(id){return null;}
`);
load('js/01a-game-characters.js');
load('js/02a-game-locations.js');
load('js/02b-game-content-index.js');
run(`let P={characters:BUNDLED_CHARACTER_SHEETS,locations:BUNDLED_LOCATION_PACKAGE.locations,content:[]};`);
load('js/15da-continuity.js');

const canonical = JSON.parse(run(`JSON.stringify(continuityIndex())`));
assert.equal(canonical.summary.errors, 0,
  'canonical character content and the generated global index should have no broken dependencies');
assert.equal(canonical.nodeById['quest:enroll_at_westshore'].external, true,
  'global game quests should be recognized without copying them into character packages');
const marcus = JSON.parse(run(`JSON.stringify(continuityImpact(continuityIndex(),'quest:one_last_summer_movie'))`));
assert.ok(marcus.affected.includes('quest:marcus_student_film'));
assert.ok(marcus.affected.includes('conversation:marcus_after_screening'));
assert.ok(marcus.affected.includes('message:marcus_movie_invitation'));
assert.ok(marcus.stateReads.includes('marcus.showed_rough_cut'));
assert.ok(marcus.stateWrites.includes('memory.marcus_lee.shared_last_summer_screening'));

run(`
  P={characters:[{
    id:'test_npc',display_name:'Test NPC',home:{location_id:'hale_home'},
    quests:[
      {id:'loop_one',title:'Loop One',activation:{event:'quest_completed',quest:'loop_two'},
        objectives:[],branches:[{id:'missing',condition:{flag:'path.open'},
          effects:[{operation:'start_quest',value:'missing_followup'}]}],completion_effects:[]},
      {id:'loop_two',title:'Loop Two',activation:{event:'quest_completed',quest:'loop_one'},
        objectives:[],branches:[],completion_effects:[]}
    ],
    conversations:[{id:'test_scene',activation:{quest_active:'loop_one',location:'hale_home.living_room'},
      nodes:{end:{speaker:'test_npc',line:'Done.',effects:[{operation:'set_flag',key:'path.open',value:true}]}}}],
    text_messages:[{id:'broken_followup',sender:'test_npc',text:'Still there?',
      trigger:{message_replied:'missing_message'},quick_replies:[]}]
  }],locations:BUNDLED_LOCATION_PACKAGE.locations,content:[]};
  globalThis.BROKEN_CONTINUITY=continuityIndex();
`);
const broken = JSON.parse(run(`JSON.stringify(BROKEN_CONTINUITY)`));
assert.ok(broken.issues.some(issue=>issue.sev==='err'&&issue.msg.includes('missing_followup')),
  'a missing quest started by a branch must block the continuity report');
assert.ok(broken.issues.some(issue=>issue.sev==='err'&&issue.msg.includes('missing_message')),
  'a missing phone trigger source must block the continuity report');
assert.ok(broken.issues.some(issue=>issue.sev==='err'&&issue.msg.includes('Circular quest progression')),
  'quest-completion cycles must be reported');
const focused = JSON.parse(run(`JSON.stringify(continuityVisibleForCharacter(BROKEN_CONTINUITY,'test_npc'))`));
assert.ok(focused.nodes.some(node=>node.key==='conversation:test_scene'));
assert.ok(focused.issues.every(issue=>issue.characters.includes('test_npc')));

console.log('continuity and dependency dashboard regression tests passed');
