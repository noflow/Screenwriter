const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const context=vm.createContext({console});
const load=file=>vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});
const run=source=>vm.runInContext(source,context);

load('js/00-state.js');
load('js/02-places.js');
load('js/11b-relationship-arc.js');

run(`
  const emma={id:'emma_rowan',name:'Emma Rowan',profile:{romance_eligible:true},
    home:{location_id:'emma_home'},social_preferences:{invitation_threshold:20,
      preferred_activities:['cafe_catchup']},relationship_chapters:[1,2,3,4,5].map(level=>({
        level,id:'emma_relationship_'+level,title:'Relationship '+level,route:'shared'
      })),story_arcs:[]};
  const arc=defaultCharacterStoryArc(emma,0);
  Object.assign(arc,{id:'different_uniform',title:'A Different Uniform',category:'transformation',
    status:'ready',summary:'Emma proposes a longer path to help the player earn a restaurant waitress job.',
    primary_location:'restaurant',quest_count:7,entry_policy:'optional',decline_policy:'defer',
    decline_outcome:'The offer remains available and Emma’s unrelated friendship content continues.',
    gate_meter:'friendship',gate_value:35,required_state:'player.employment.job=restaurant_kitchen',
    required_memories:['emma_shared_work_problem'],prerequisite_quests:['restaurant_orientation'],
    conflict:'The player must decide how far to follow Emma’s plan.',
    important_choice:'Accept, defer, or decline the transformation.',
    consequence:'The restaurant career path changes only when accepted.',
    callback:'Later coworkers remember the uniform experiment.'});
  emma.story_arcs.push(arc);
  P={characters:[emma],locations:[{id:'emma_home'},{id:'restaurant'}],content:[
    {uid:'prereq',type:'quest',id:'restaurant_orientation',title:'Restaurant Orientation',character:'emma_rowan',stages:[]}
  ],districts:[],travel:null,aliases:{},dismissedBundledCharacters:[]};
  normalizeCharacterStoryArcs(emma);
  const slots=characterStoryArcQuestSlots(emma,arc);
  slots.forEach(slot=>{
    const result=ensureCharacterStoryArcQuest(emma,slot);
    result.quest.stages[0].nodes=[{type:'line',speaker:'emma_rowan',text:'Story part '+slot.part}];
  });
  const first=characterStoryArcQuest(emma,slots[0]);
  const issues=characterStoryArcIssues(emma,arc);
  renameCharacterStoryArc(emma,arc,'emma_waitress_transformation');
  const renamedIds=P.content.filter(item=>item.questPlan?.characterArc).map(item=>item.id).sort();
  const renamedAfter=P.content.find(item=>item.id==='emma_waitress_transformation_part_7').after;
  arc.quest_count=4;
  globalThis.CHARACTER_ARC_RESULT={arc,slots,first,issues,renamedIds,renamedAfter,
    visibleSlots:characterStoryArcQuestSlots(emma,arc).length,
    authoredQuestCount:P.content.filter(item=>item.questPlan?.characterArc).length};
`);

const result=JSON.parse(JSON.stringify(context.CHARACTER_ARC_RESULT));
assert.equal(result.slots.length,7);
assert.equal(result.slots[1].after,'different_uniform');
assert.equal(result.first.requires.some(rule=>rule.type==='stat'&&rule.key==='friendship'&&rule.value===35),true);
assert.equal(result.first.requires.some(rule=>rule.type==='flag'&&rule.key==='player.employment.job=restaurant_kitchen'),true);
assert.equal(result.first.requires.some(rule=>rule.type==='memory'&&rule.key==='emma_shared_work_problem'),true);
assert.equal(result.first.requires.some(rule=>rule.type==='flag'&&rule.key==='quest_restaurant_orientation_done'),true);
assert.equal(result.first.questPlan.characterArc.entry_policy,'optional');
assert.equal(result.first.questPlan.characterArc.decline_policy,'defer');
assert.match(result.first.questPlan.branchIdeas,/accept, defer, or decline/i);
assert.deepEqual(result.issues,[]);
assert.equal(result.arc.id,'emma_waitress_transformation');
assert.equal(result.renamedIds.includes('emma_waitress_transformation'),true);
assert.equal(result.renamedIds.includes('emma_waitress_transformation_part_7'),true);
assert.equal(result.renamedAfter,'emma_waitress_transformation_part_6');
assert.equal(result.visibleSlots,4);
assert.equal(result.authoredQuestCount,7,'shortening the plan must not delete authored quests');
assert.equal(run('PA_CHARACTER_ARC_CATEGORIES.some(category=>category.id===\'workplace\')'),true);
assert.equal(run('PA_CHARACTER_ARC_CATEGORIES.some(category=>category.id===\'transformation\')'),true);

run(`
  function countLines(){return 1;}
  function contentAvailability(){return [];}
  function customStatDefs(){return [];}
  function statDefinition(){return null;}
  function walkAll(){}
  function flagRegistry(){return {};}
  function links(){return [];}
  function missingRefs(){return [];}
  function coverage(){return {};}
`);
load('js/15b-validate.js');
run("globalThis.CHARACTER_ARC_VALIDATION=validate().filter(issue=>issue.sev==='err'&&issue.msg.includes('Character story')).map(issue=>issue.msg)");
assert.deepEqual(Array.from(context.CHARACTER_ARC_VALIDATION),[]);

console.log('independent character story arc regression tests passed');
