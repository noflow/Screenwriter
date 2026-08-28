const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'..');
const context=vm.createContext({console});
const load=file=>vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});
const run=source=>vm.runInContext(source,context);

load('js/00-state.js');
load('js/11b-relationship-arc.js');

run(`
  const arcCharacter={id:'river_song',name:'River Song',profile:{romance_eligible:true},
    home:{location_id:'river_home'},social_preferences:{invitation_threshold:20,
      preferred_activities:['cafe_catchup']},relationship_chapters:[1,2,3,4,5].map(level=>({
        level,id:'river_chapter_'+level,title:'River Chapter '+level
      }))};
  P={characters:[arcCharacter],locations:[{id:'river_home',name:'River Home'}],content:[],
    districts:[],travel:null,aliases:{},dismissedBundledCharacters:[]};
  arcCharacter.relationship_chapters.forEach(chapter=>{
    const plan=normalizeRelationshipChapterStory(arcCharacter,chapter);
    plan.conflict='A conflict for '+chapter.level;
    plan.important_choice='A choice for '+chapter.level;
    plan.consequence='A consequence for '+chapter.level;
    plan.callback='A callback for '+chapter.level;
    plan.status='ready';
    const result=ensureRelationshipChapterQuest(arcCharacter,chapter);
    result.quest.stages[0].nodes=[{type:'line',speaker:'river_song',text:'Chapter '+chapter.level}];
  });
  const secondQuest=relationshipChapterQuest(arcCharacter,arcCharacter.relationship_chapters[1]);
  secondQuest.stages[0].nodes=[];
  secondQuest.stages[0].completion={event:'conversation_completed',conversation:'river_second_scene'};
  P.content.push({uid:'river-conversation',type:'conversation',id:'river_second_scene',title:'Second scene',
    cast:['river_song'],nodes:[{type:'line',speaker:'river_song',text:'Linked dialogue.'}],_authored:{activation:{}}});
  const initialSummary=JSON.parse(JSON.stringify(relationshipArcSummary(arcCharacter)));
  setRelationshipArcQuestTotal(arcCharacter,8);
  arcCharacter.relationship_chapters.forEach(chapter=>relationshipChapterQuestSlots(arcCharacter,chapter).forEach(slot=>{
    const made=ensureRelationshipChapterQuest(arcCharacter,slot);
    if(made.created)made.quest.stages[0].nodes=[{type:'line',speaker:'river_song',text:slot.title}];
  }));
  const longCounts=arcCharacter.relationship_chapters.map(chapter=>chapter.story_plan.quest_count);
  const longSlots=relationshipChapterQuestSlots(arcCharacter,arcCharacter.relationship_chapters[0]);
  const longSummary=JSON.parse(JSON.stringify(relationshipArcSummary(arcCharacter)));
  const contentAfterLong=P.content.filter(item=>item.type==='quest').length;
  setRelationshipArcQuestTotal(arcCharacter,3);
  const shortCounts=arcCharacter.relationship_chapters.map(chapter=>chapter.story_plan.quest_count);
  const shortSummary=JSON.parse(JSON.stringify(relationshipArcSummary(arcCharacter)));
  globalThis.ARC_RESULT={
    routes:arcCharacter.relationship_chapters.map(chapter=>chapter.route),
    locations:arcCharacter.relationship_chapters.map(chapter=>chapter.story_plan.primary_location),
    questCount:initialSummary.quests,
    secondMetrics:relationshipArcQuestMetrics(arcCharacter,arcCharacter.relationship_chapters[1]),
    summary:initialSummary,longCounts,longSlots,longSummary,contentAfterLong,shortCounts,shortSummary,
    contentAfterShort:P.content.filter(item=>item.type==='quest').length
  };
`);

const result=JSON.parse(JSON.stringify(context.ARC_RESULT));
assert.deepEqual(result.routes,['shared','shared','shared','shared','shared']);
assert.deepEqual(result.locations,['river_home','river_home','river_home','river_home','river_home']);
assert.equal(result.questCount,5);
assert.equal(result.secondMetrics.conversations.length,1);
assert.equal(result.secondMetrics.lineCount,1);
assert.equal(result.summary.quests,5);
assert.equal(result.summary.ready,5);
assert.equal(result.summary.rows.every(row=>row.issues.length===0),true);
assert.deepEqual(result.longCounts,[2,2,2,1,1]);
assert.equal(result.longSummary.planned,8);
assert.equal(result.longSummary.quests,8);
assert.equal(result.longSlots[1].id,'river_chapter_1_part_2');
assert.equal(result.longSlots[1].after,'river_chapter_1');
assert.deepEqual(result.shortCounts,[1,1,1,0,0]);
assert.equal(result.shortSummary.planned,3);
assert.equal(result.shortSummary.quests,3);
assert.equal(result.contentAfterLong,8);
assert.equal(result.contentAfterShort,8);
assert.equal(run('PA_RELATIONSHIP_ROUTES.length'),3);

console.log('relationship arc workshop regression tests passed');
