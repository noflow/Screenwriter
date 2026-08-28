const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
function element(id) {
  return {
    id, value: '', textContent: '', innerHTML: '', hidden: false, disabled: false, open: false,
    style: {}, dataset: {}, options: [],
    querySelectorAll: () => [], addEventListener: () => {}, setAttribute: () => {},
    focus: () => {}, showModal() { this.open = true; }, close() { this.open = false; },
  };
}
const elements = new Proxy({}, {get(target, id) { return target[id] || (target[id] = element(id)); }});
const context = vm.createContext({
  console,
  document: {getElementById: id => elements[id], querySelectorAll: () => []},
  window: {confirm: () => true},
  localStorage: {setItem: () => {}, removeItem: () => {}, getItem: () => null},
  setTimeout: () => 0, clearTimeout: () => {}, requestAnimationFrame: callback => callback(),
  AbortController,
});

function load(file) {
  vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, {filename: file});
}

load('js/00-state.js');
vm.runInContext(`
  var DISTRICTS=[],TRAVEL=null,ALIASES={};
  function customStatDefs(){ return [{id:'courage',label:'Courage',minimum:0,maximum:100,default:10}]; }
  function placeName(ref){ return ref; }
  function resolvePlaceRef(value){
    const wanted=slug(String(value||'').replace(/[—–>-]+/g,' '));
    const matches=[];
    P.locations.forEach(place=>{
      if([place.id,place.name].map(slug).includes(wanted))matches.push(place.id);
      (place.rooms||[]).forEach(room=>{
        const ref=place.id+'.'+room.id;
        if([ref,room.id,room.name,place.name+' '+room.name].map(slug).includes(wanted))matches.push(ref);
      });
    });
    const unique=[...new Set(matches)];return unique.length===1?unique[0]:null;
  }
  function paintAll(){}
  function openQuestBuilder(){}
  function updateQuestFromBuilder(){ return qbQuest; }
  function askModel(){ return Promise.resolve(''); }
  function isLocalEngine(){ return true; }
  function note(){}
`, context);
load('js/08h-quest-builder.js');
// Restore the real builder helpers after the test's harmless forward declaration.
vm.runInContext('globalThis.REAL_UPDATE = updateQuestFromBuilder;', context);
load('js/08i-quest-workshop.js');

vm.runInContext(`
  P={
    characters:[
      {id:'emma_rowan',name:'Emma Rowan',profile:{},relationship_defaults:{trust:20},custom_stats:{courage:10}},
      {id:'marina_lee',name:'Marina Lee',profile:{},relationship_defaults:{love:5},custom_stats:{courage:30}}
    ],
    locations:[
      {id:'bluebird_cafe',name:'Bluebird Cafe',rooms:[{id:'back_room',name:'Back Room'}]},
      {id:'marina',name:'Marina',rooms:[]}
    ],content:[],districts:[],travel:null,aliases:{},custom_stats:[]
  };
  qbQuest={uid:'q1',type:'quest',id:'hidden_favor',title:'Old title',character:'emma_rowan',
    hook:'Old summary',premise:'Old summary',location:'bluebird_cafe',after:'',requires:[],
    stages:[
      {id:'meet_emma',title:'Old objective',location:'bluebird_cafe',nodes:[{type:'line',speaker:'emma_rowan',text:'Keep me.'}],flag:'',requires:[]},
      {id:'branch',title:'Branch — outcome',location:'bluebird_cafe',nodes:[{type:'choice',options:[]}],flag:'',requires:[]}
    ],
    questPlan:{category:'character_story',summary:'Old summary',participants:[],rewardRows:[],rewards:'',advancedRewards:'',branchIdeas:'',event:null}
  };
  const worksheet=[
    'TITLE: The Favor Behind the Smile',
    'CATEGORY: relationship',
    'GIVER: Emma Rowan',
    'CAST: marina_lee, Ghost Person, player',
    'SETTING: Bluebird Cafe - Back Room',
    'SUMMARY: Emma asks for help but hides why the favor matters.',
    'DEADLINE: Before Friday night',
    'OBJECTIVES:',
    '- Meet Emma after closing',
    '- Find the missing envelope',
    'REWARDS:',
    '- emma_rowan.trust +3',
    '- Player confidence +2',
    '- Marina Lee love +1',
    'BRANCH IDEAS:',
    '- If Emma Trust is 50 or higher, she tells the truth.',
    '- Otherwise, she changes the subject.',
    'FOLLOW-UP EVENT:',
    'TITLE: Meet at the marina',
    'DATE: Y1-08-23',
    'TIME: evening',
    'LOCATION: marina'
  ].join('\\n');
  const parsed=parseQuestWorkshopDraft(worksheet);
  const applied=applyQuestWorkshopDraft(parsed);
  const fallback=parseQuestWorkshopDraft('A strange favor becomes personal.\\n- Talk to Emma\\n- Check the locked room');
  const dashed=parseQuestWorkshopDraft('TITLE - A Dashed Title\\nOBJECTIVES\\n1. Ask for help');
  normalizeQuestObjectiveIds(qbQuest);
  globalThis.RESULT=JSON.parse(JSON.stringify({parsed,applied,fallback,dashed,quest:qbQuest}));
`, context);

const {parsed, applied, fallback, dashed, quest} = JSON.parse(JSON.stringify(context.RESULT));
assert.equal(parsed.title, 'The Favor Behind the Smile');
assert.equal(parsed.event.title, 'Meet at the marina');
assert.equal(parsed.event.location, 'marina');
assert.deepEqual(parsed.objectives, ['Meet Emma after closing', 'Find the missing envelope']);
assert.equal(quest.title, 'The Favor Behind the Smile');
assert.equal(quest.location, 'bluebird_cafe.back_room');
assert.equal(quest.stages[0].id, 'meet_emma');
assert.equal(quest.stages[0].nodes[0].text, 'Keep me.');
assert.equal(quest.stages[1].title, 'Find the missing envelope');
assert.equal(quest.stages[2].id, 'branch');
assert.deepEqual(quest.questPlan.participants, ['marina_lee']);
assert.deepEqual(quest.questPlan.rewardRows, [
  {character:'emma_rowan',reward:'relationship:trust',value:3},
  {character:'player',reward:'attributes:confidence',value:2},
  {character:'marina_lee',reward:'relationship:love',value:1},
]);
assert.equal(quest.questPlan.event.block, 'evening');
assert.equal(quest.questPlan.event.location, 'marina');
assert.match(quest.questPlan.branchIdeas, /Otherwise/);
assert(applied.issues.some(issue => issue.includes('Ghost Person')));
assert.match(fallback.summary, /strange favor/i);
assert.deepEqual(fallback.objectives, ['Talk to Emma', 'Check the locked room']);
assert.equal(dashed.title, 'A Dashed Title');
assert.deepEqual(dashed.objectives, ['Ask for help']);

console.log('quest workshop regression tests passed');
