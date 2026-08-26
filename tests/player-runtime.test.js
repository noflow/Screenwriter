const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const elements = new Proxy({}, {get(target, id) {
  if (!target[id]) target[id] = {checked: id === 'writePlayer', value: '', innerHTML: ''};
  return target[id];
}});
const context = vm.createContext({
  console,
  document: {getElementById: id => elements[id]},
  setTimeout: () => 0,
  clearTimeout: () => {},
});

function load(file) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, {filename: file});
}

load('js/00-state.js');
load('js/12-conditions.js');
load('js/15-registry.js');
load('js/15f-contract.js');
load('js/13-routes.js');
load('js/15b-validate.js');

vm.runInContext(`
  function customStatDefs(){ return []; }
  function statDefinition(){ return null; }
  function locPart(ref){ return String(ref || '').split('.')[0]; }
  function roomPart(){ return ''; }
  function roomOf(){ return null; }
  function availability(){ return {free:true,why:'available',where:''}; }
  function placeName(ref){ return ref; }
  function links(){ return []; }
  function countLines(nodes){
    return (nodes || []).reduce((total,node)=>total+(node.type==='line'?1:
      (node.options || []).reduce((sum,option)=>sum+countLines(option.nodes),0)),0);
  }

  P={
    characters:[{
      id:'emma_rowan',name:'Emma Rowan',color:'#fff',profile:{},home:{household:['player']},
      relationship_defaults:{trust:10},relationship_chapters:[],custom_stats:{},connections:[]
    }],
    locations:[{id:'home',name:'Home',tags:[]}],districts:[],travel:null,aliases:{},
    content:[{
      uid:'scene-1',type:'conversation',id:'choose_direction',title:'Choose Your Direction',
      location:'home',day:'monday',block:'evening',cast:['emma_rowan'],start:true,
      requires:[{type:'flag',key:'player.life_path=college',op:'is_true',value:1}],
      nodes:[
        {type:'line',speaker:'emma_rowan',text:'What do you want to do?',emotion:''},
        {type:'choice',options:[{text:'Choose college',requires:[],
          flag:'sandbox.active; player.life_path=college; household.mutual_privacy_rule; emma_rowan.trust +2',
          nodes:[{type:'line',speaker:'emma_rowan',text:'Then let us make a plan.',emotion:''}]}]}
      ]
    }]
  };

  const effects=compileEffects('sandbox.active; player.life_path=college; household.mutual_privacy_rule; emma_rowan.trust +2');
  const reg=flagRegistry(),state=stateRegistry();
  const sim={stats:{},flags:{},chapters:{},memories:{}};
  applyFlag('player.life_path=college',sim);
  globalThis.RESULT={
    playerId:chr('player').id,
    runtimePlayer:chr('player')._runtime_player===true,
    npcCount:npcs().length,
    effects:JSON.parse(JSON.stringify(effects)),
    registryKeys:Object.keys(reg).sort(),
    flagKeys:state.flags.map(x=>x.key).sort(),
    statKeys:state.stats.map(x=>x.key).sort(),
    conditionWorks:condMet({type:'flag',key:'player.life_path=college',op:'is_true',value:1},sim),
    errors:validate().filter(x=>x.sev==='err').map(x=>x.msg)
  };

  P.content[0].nodes[1].options[0].flag+='; ghost.trust +1';
  globalThis.GHOST_ERRORS=validate().filter(x=>x.sev==='err').map(x=>x.msg);
  P.characters.push({id:'old_player',name:'Old Player',profile:{is_player:true}});
  globalThis.LEGACY_RESULT={npcIds:npcs().map(c=>c.id),runtimeId:playerChar().id};
`, context);

const result = JSON.parse(JSON.stringify(context.RESULT));
assert.equal(result.playerId, 'player');
assert.equal(result.runtimePlayer, true);
assert.equal(result.npcCount, 1);
assert.deepEqual(result.effects, [
  {operation:'set_flag', key:'sandbox.active', value:true},
  {operation:'set_value', key:'player.life_path', value:'college'},
  {operation:'set_flag', key:'household.mutual_privacy_rule', value:true},
  {operation:'add_meter', character:'emma_rowan', meter:'trust', value:2},
]);
assert(result.registryKeys.includes('player.life_path=college'));
assert(result.flagKeys.includes('player.life_path'));
assert(result.flagKeys.includes('sandbox.active'));
assert(result.flagKeys.includes('household.mutual_privacy_rule'));
assert(result.statKeys.includes('emma_rowan.trust'));
assert(!result.statKeys.some(key => key.startsWith('player.')));
assert.equal(result.conditionWorks, true);
assert.deepEqual(result.errors, []);
const ghostErrors = JSON.parse(JSON.stringify(context.GHOST_ERRORS));
assert(ghostErrors.some(message => message.includes('ghost') && message.includes('no sheet')));
const legacyResult = JSON.parse(JSON.stringify(context.LEGACY_RESULT));
assert.deepEqual(legacyResult.npcIds, ['emma_rowan']);
assert.equal(legacyResult.runtimeId, 'player');

console.log('player-runtime regression tests passed');
