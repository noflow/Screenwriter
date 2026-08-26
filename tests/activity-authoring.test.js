const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const context = vm.createContext({console});
const load = file => vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context, {filename:file});

load('js/00-state.js');
vm.runInContext(`
  var DISTRICTS=[],TRAVEL=null,ALIASES={};
  function locPart(ref){ return String(ref||'').split('.')[0]; }
  function roomPart(ref){ return String(ref||'').split('.').slice(1).join('.'); }
  function placeName(ref){ return ref; }
  function customStatDefs(){ return []; }
  function statDefinition(){ return null; }
  function gameReady(c){
    const out=JSON.parse(JSON.stringify(c));
    delete out.activities;delete out.conversations;delete out.quests;delete out.content;
    return out;
  }
`, context);
load('js/03-schedule.js');
load('js/12-conditions.js');
load('js/15-registry.js');
load('js/15f-contract.js');
load('js/17-authored-in.js');
load('js/18-authored-out.js');
vm.runInContext(`
  function applyFlag(raw,S){
    compileEffects(raw).forEach(e=>{
      if(e.operation==='set_flag'||e.operation==='set_value')S.flags[e.key]=e.value;
      else if(e.operation==='add_value')S.flags[e.key]=(+S.flags[e.key]||0)+(+e.value||0);
    });
  }
  function reachable(){ return {rows:[]}; }
`, context);
load('js/15d-simulate.js');

vm.runInContext(`
  const mom={id:'elena_reyes_hale',display_name:'Elena Reyes Hale',name:'Elena Reyes Hale',
    profile:{},home:{location_id:'hale_home'},schedule:{fixed_commitments:[{
      days:['saturday'],blocks:['evening'],activity:'work',location:'clinic',unavailable:true
    }]},relationship_defaults:{trust:40,love:70},relationship_chapters:[]};
  P={characters:[mom],locations:[{id:'hale_home',name:'Hale Home',rooms:[{id:'living_room',name:'Living Room'}]}],
    content:[],districts:[],travel:null,aliases:{}};
  const sheet={...mom,
    activities:[{
      id:'watch_tv_with_mom',kind:'social_activity',name:'Watch TV with Mom',category:'family_time',
      summary:'A quiet family television tradition.',character:mom.id,
      activation:{quest_active:'watch_tv_with_mom',location:'hale_home.living_room',
        days:['friday','saturday'],blocks:['evening']},
      conditions:[{meter_at_least:[mom.id,'trust',50]}],counter_key:'activity.watch_tv_with_mom.count',
      increments_on:'explicit_success',repeat_limit:'once_per_block',milestone_semantics:'after_successes',
      base:{conversation:'watch_tv_base'},
      milestones:[{id:'massage_offer',at:5,title:'Massage offer',once:false,conversation:'watch_tv_massage',
        conditions:[{meter_at_least:[mom.id,'love',80]}]}]
    }],
    conversations:[
      {id:'watch_tv_base',type:'activity_beat',internal:true,replayable:true,start_node:'ask',nodes:{
        ask:{speaker:mom.id,line:'Want to watch television?',next:'answer'},
        answer:{speaker:'player',choices:[
          {id:'yes',text:'Watch with her',next:'yes_line'},
          {id:'no',text:'Not tonight',next:'no_line'}]},
        yes_line:{stage_direction:'They settle in and finish the episode.',
          effects:[{operation:'complete_activity',value:'watch_tv_with_mom'}]},
        no_line:{speaker:mom.id,line:'Another time.'}
      }},
      {id:'watch_tv_massage',type:'activity_beat',internal:true,replayable:true,start_node:'offer',nodes:{
        offer:{branches:[
          {id:'love_high',text:'Love is high',conditions:[{meter_at_least:[mom.id,'love',80]}],
            next:'accept'},
          {id:'fallback',text:'Otherwise',next:'decline'}]},
        accept:{speaker:mom.id,line:'A shoulder rub sounds nice, thank you.',
          effects:[{operation:'complete_activity',value:'watch_tv_with_mom'}]},
        decline:{speaker:mom.id,line:'No, thank you.',
          effects:[{operation:'complete_activity',value:'watch_tv_with_mom'}]}
      }},
      {id:'ordinary_chat',type:'standard_topic',start_node:'hello',
        activation:{location:'hale_home.living_room',days:['friday','saturday'],block:'evening'},
        nodes:{hello:{speaker:mom.id,line:'Hello.'}}}
    ],
    // Quests and their repeatable activity commonly share an id. They occupy
    // separate runtime collections and must remain separate editor items.
    quests:[{id:'watch_tv_with_mom',title:'Family Evenings',summary:'Spend time together.',
      objectives:[{id:'watch_five',text:'Watch TV five times',
        completion:{event:'activity_count_at_least',activity:'watch_tv_with_mom',value:5}},
        {id:'massage_offer',text:'Offer a shoulder massage',
          hidden_until:{event:'activity_count_at_least',activity:'watch_tv_with_mom',value:5},
          completion:{event:'conversation_node_reached',conversation:'watch_tv_massage',node:'accept'}}]}]
  };

  const report=importAuthored(sheet);
  const activity=P.content.find(x=>x.type==='activity');
  const quest=P.content.find(x=>x.type==='quest');
  const baseChoice=activity.stages[0].nodes.find(x=>x.type==='choice');
  const baseSuccessLine=baseChoice.options[0].nodes.find(x=>x.type==='line');
  const exportedActivity=activityOut(activity);
  const exportedBeats=activityConversations(activity);
  const exportedQuest=questOut(quest);
  const ordinary=passageGroups(mom.id).find(g=>g.base==='ordinary_chat');
  const exportedOrdinary=conversationOut(ordinary);
  const v3=activityBlocks();
  const fullSheet=sheetOut(mom);
  const availabilityRows=contentAvailability(mom,activity);
  const legacy=JSON.parse(JSON.stringify(activity));
  legacy.requires=[{type:'flag',key:'new_gate',op:'is_true',value:1}];
  legacy._authored.condition={flag:'old_gate'};
  legacy._authored.source.condition={flag:'old_gate'};
  const editedLegacy=activityOut(legacy);
  const blockEdited=JSON.parse(JSON.stringify(activity));
  setContentBlock(blockEdited,'late_evening');
  const editedBlock=activityOut(blockEdited);
  const planned=JSON.parse(JSON.stringify(activity));
  planned.stages[0].scenePlan={consequence:{character:mom.id,memoryId:'tv_memory',chapter:2}};
  const plannedActivity=activityOut(planned);
  const plannedBeat=activityConversations(planned)[0];
  const noRepeat=JSON.parse(JSON.stringify(activity));
  noRepeat.repeatLimit='';
  const clearedRepeat=activityOut(noRepeat);

  renameContentId(activity,'watch_tv_nights');
  const renamed=JSON.parse(JSON.stringify({id:activity.id,counter:activityCounterKey(activity),
    objective:quest.stages[0].completion,hidden:quest.stages[1].hiddenUntil,
    exported:activityOut(activity),
    beats:activityConversations(activity)}));
  renameContentId(activity,'watch_tv_with_mom');

  const authoredProject=P;
  P={characters:[mom],locations:[],districts:[],travel:null,aliases:{},content:[{
    uid:'a_retry',type:'activity',id:'retry_activity',title:'Retry activity',character:mom.id,
    day:'',days:[],block:'evening',cast:[mom.id],requires:[],incrementsOn:'explicit_success',
    milestoneSemantics:'after_successes',stages:[
      {id:'base',title:'Base',at:0,once:false,requires:[],flag:'',
        nodes:[{type:'line',speaker:mom.id,text:'Base success',activitySuccess:true}]},
      {id:'retry',title:'Retry milestone',at:0,once:true,requires:[],flag:'milestone_reward',
        nodes:[{type:'gate',options:[
          {text:'ready',requires:[{type:'flag',key:'retry_ready',op:'is_true',value:1}],
            flag:'',activitySuccess:true,nodes:[]},
          {text:'not ready',requires:[],flag:'retry_ready',activitySuccess:false,nodes:[]}
        ]}]}
    ]
  }]};
  const simulation=simulate(3);
  P=authoredProject;

  const first={
    report,activity:JSON.parse(JSON.stringify(activity)),quest:JSON.parse(JSON.stringify(quest)),
    acceptedBranch:!!baseChoice.options[0].activitySuccess,
    acceptedTerminal:!!baseSuccessLine.activitySuccess,rejected:!!baseChoice.options[1].activitySuccess,
    exportedActivity,exportedBeats,exportedQuest,exportedOrdinary,v3,fullSheet,
    editedLegacy,editedBlock,plannedActivity,plannedBeat,clearedRepeat,renamed,simulation,availabilityRows
  };

  P.content=[];
  const secondReport=importAuthored(fullSheet);
  const secondActivity=P.content.find(x=>x.type==='activity');
  const secondChoice=secondActivity.stages[0].nodes.find(x=>x.type==='choice');
  const secondSuccessLine=secondChoice.options[0].nodes.find(x=>x.type==='line');
  globalThis.RESULT=JSON.parse(JSON.stringify({first,secondReport,
    second:{days:contentDays(secondActivity),owner:secondActivity.character,
      incrementsOn:secondActivity.incrementsOn,repeatLimit:secondActivity.repeatLimit,
      accepted:secondSuccessLine.activitySuccess,
      objective:P.content.find(x=>x.type==='quest').stages[0].completion,
      hiddenUntil:P.content.find(x=>x.type==='quest').stages[1].hiddenUntil,
      activity:activityOut(secondActivity)}}));
`, context);

const {first, secondReport, second} = JSON.parse(JSON.stringify(context.RESULT));
assert.equal(first.report.activities.length, 1);
assert.equal(first.report.quests.length, 1);
assert.deepEqual(first.report.conversations, ['ordinary_chat']);
assert.equal(first.activity.id, 'watch_tv_with_mom');
assert.equal(first.quest.id, 'watch_tv_with_mom');
assert.deepEqual(first.activity.days, ['friday', 'saturday']);
assert.equal(first.activity.character, 'elena_reyes_hale');
assert.equal(first.activity.title, 'Watch TV with Mom');
assert.equal(first.activity.name, 'Watch TV with Mom');
assert.deepEqual(first.activity.requires, [
  {type:'stat',character:'elena_reyes_hale',key:'trust',op:'gte',value:50},
]);
assert.equal(first.acceptedBranch, false);
assert.equal(first.acceptedTerminal, true);
assert.equal(first.rejected, false);
assert.deepEqual(first.quest.stages[0].completion,
  {event:'activity_count_at_least',activity:'watch_tv_with_mom',value:5});

assert.equal(first.exportedActivity.kind, 'social_activity');
assert.equal(first.exportedActivity.name, 'Watch TV with Mom');
assert.equal(first.exportedActivity.category, 'family_time');
assert.equal(first.exportedActivity.summary, 'A quiet family television tradition.');
assert.equal(first.exportedActivity.increments_on, 'explicit_success');
assert.equal(first.exportedActivity.repeat_limit, 'once_per_block');
assert.equal(first.exportedActivity.milestone_semantics, 'after_successes');
assert.deepEqual(first.exportedActivity.activation.days, ['friday', 'saturday']);
assert.equal(first.exportedActivity.activation.quest_active, 'watch_tv_with_mom');
assert.equal(first.exportedActivity.activation.location, 'hale_home.living_room');
assert.deepEqual(first.exportedActivity.conditions,
  [{meter_at_least:['elena_reyes_hale','trust',50]}]);
assert.deepEqual(first.exportedActivity.milestones[0].conditions,
  [{meter_at_least:['elena_reyes_hale','love',80]}]);
assert.equal(first.exportedActivity.milestones[0].id, 'massage_offer');
assert.equal(first.exportedActivity.milestones[0].title, 'Massage offer');
assert.equal(first.exportedActivity.milestones[0].condition, undefined);
assert.deepEqual(first.exportedQuest.objectives[0].completion,
  {event:'activity_count_at_least',activity:'watch_tv_with_mom',value:5});
assert.deepEqual(first.exportedQuest.objectives[1].hidden_until,
  {event:'activity_count_at_least',activity:'watch_tv_with_mom',value:5});
assert.deepEqual(first.exportedOrdinary.activation.days, ['friday','saturday']);

const baseBeat=first.exportedBeats.find(x=>x.id==='watch_tv_base');
assert.equal(baseBeat.internal, true);
assert.equal(baseBeat.replayable, true);
const authoredChoice=Object.values(baseBeat.nodes).find(x=>Array.isArray(x.choices));
assert(!authoredChoice.choices[0].effects?.some(e=>e.operation==='complete_activity'));
assert(!authoredChoice.choices[1].effects?.some(e=>e.operation==='complete_activity'));
assert(baseBeat.nodes.yes_line.effects.some(e=>
  e.operation==='complete_activity'&&e.value==='watch_tv_with_mom'));

assert.equal(first.v3.activities[0].kind, 'social_activity');
assert.equal(first.v3.activities[0].repeat_limit, 'once_per_block');
assert.deepEqual(first.v3.activities[0].activation.days, ['friday','saturday']);
assert.equal(first.v3.activities[0].activation.quest_active, 'watch_tv_with_mom');
assert.equal(first.v3.activities[0].milestones[0].id, 'massage_offer');
assert.equal(first.v3.conversations[0].internal, true);
const runtimeChoice=first.v3.conversations[0].nodes.find(x=>x.type==='choice');
assert(!runtimeChoice.options[0].effects.some(e=>e.operation==='complete_activity'));
assert(runtimeChoice.options[0].nodes.some(n=>n.type==='line'&&
  n.effects?.some(e=>e.operation==='complete_activity')));

assert.equal(first.editedLegacy.condition, undefined);
assert.deepEqual(first.editedLegacy.conditions,[{flag:'new_gate'}]);
assert.deepEqual(first.editedBlock.activation.blocks,['late_evening']);
assert(first.plannedActivity.base.effects.some(e=>e.operation==='create_memory'&&e.value==='tv_memory'));
assert(first.plannedActivity.base.effects.some(e=>e.operation==='unlock_relationship_chapter'&&e.level===2));
assert.equal(first.plannedBeat.completion_effects, undefined);
assert.equal(first.clearedRepeat.repeat_limit, undefined);
assert.equal(first.renamed.id, 'watch_tv_nights');
assert.equal(first.renamed.counter, 'activity.watch_tv_nights.count');
assert.equal(first.renamed.exported.counter_key, 'activity.watch_tv_nights.count');
assert.equal(first.renamed.objective.activity, 'watch_tv_nights');
assert.equal(first.renamed.hidden.activity, 'watch_tv_nights');
assert(first.renamed.beats.flatMap(x=>Object.values(x.nodes)).some(n=>
  n.effects?.some(e=>e.operation==='complete_activity'&&e.value==='watch_tv_nights')));
assert(!first.renamed.beats.flatMap(x=>Object.values(x.nodes)).some(n=>
  n.effects?.some(e=>e.operation==='complete_activity'&&e.value==='watch_tv_with_mom')));
assert.deepEqual(first.availabilityRows.map(x=>[x.day,x.free]),
  [['friday',true],['saturday',false]]);
const retryLogs=first.simulation.log.filter(x=>x.kind==='milestone');
assert.deepEqual(retryLogs.map(x=>x.success),[false,true]);
assert.equal(first.simulation.S.flags.milestone_reward,true);
assert.equal(first.simulation.S.stats['activity.retry_activity.count'],2);

assert.equal(secondReport.activities.length, 1);
assert.deepEqual(secondReport.conversations, ['ordinary_chat']);
assert.deepEqual(second.days, ['friday','saturday']);
assert.equal(second.owner, 'elena_reyes_hale');
assert.equal(second.incrementsOn, 'explicit_success');
assert.equal(second.repeatLimit, 'once_per_block');
assert.equal(second.accepted, true);
assert.deepEqual(second.objective,
  {event:'activity_count_at_least',activity:'watch_tv_with_mom',value:5});
assert.deepEqual(second.hiddenUntil,
  {event:'activity_count_at_least',activity:'watch_tv_with_mom',value:5});
assert.deepEqual(second.activity.conditions,
  [{meter_at_least:['elena_reyes_hale','trust',50]}]);
assert.equal(second.activity.activation.quest_active, 'watch_tv_with_mom');
assert.equal(second.activity.milestones[0].id, 'massage_offer');

console.log('activity authoring round-trip tests passed');
