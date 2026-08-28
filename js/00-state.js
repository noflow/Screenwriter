const HOST='http://localhost:11434',$=id=>document.getElementById(id);
const PAL=['#C9A227','#C4778E','#8FB08A','#7FA3C4','#C98F5B','#A98FC4','#C4B27F','#8FC4BC'];
const DAYS=['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
const BLOCKS=['early_morning','morning','lunch','afternoon','evening','late_evening','night'];

/** Port Alder's reusable, non-romantic invitations. Character sheets choose
    favorites from this stable registry; the runtime owns prices and venues. */
const PA_SOCIAL_ACTIVITIES=Object.freeze([
  Object.freeze({id:'waterfront_hangout',name:'Waterfront Hangout'}),
  Object.freeze({id:'cafe_catchup',name:'Café Catch-Up'}),
  Object.freeze({id:'movie_hangout',name:'Movie Hangout'}),
  Object.freeze({id:'galleria_browse',name:'Browse the Galleria'}),
  Object.freeze({id:'nightclub_hangout',name:'Nightclub Hangout'})
]);

/** Relationship chapters advance in the game only after this due diligence.
    The character sheet supplies the five story-arc ids and titles. */
const PA_RELATIONSHIP_MILESTONES=Object.freeze([
  Object.freeze({level:1,shared_activities:0,bond:0,trust:0,agreement_required:false}),
  Object.freeze({level:2,shared_activities:1,bond:20,trust:15,agreement_required:false}),
  Object.freeze({level:3,shared_activities:3,bond:40,trust:40,agreement_required:false}),
  Object.freeze({level:4,shared_activities:6,bond:65,trust:60,agreement_required:true}),
  Object.freeze({level:5,shared_activities:10,bond:85,trust:80,agreement_required:true})
]);
const PA_RELATIONSHIP_ROUTES=Object.freeze([
  Object.freeze({id:'shared',name:'Shared / organic'}),
  Object.freeze({id:'platonic',name:'Platonic'}),
  Object.freeze({id:'romantic',name:'Romantic'})
]);
const PA_STORY_STATUSES=Object.freeze(['draft','ready','complete']);

function defaultSocialPreferences(){
  return {invitation_threshold:20,preferred_activities:['waterfront_hangout','cafe_catchup']};
}
function normalizeSocialPreferences(character){
  const current=character?.social_preferences;
  if(!current||typeof current!=='object'||Array.isArray(current))
    character.social_preferences=defaultSocialPreferences();
  else{
    const threshold=Number(current.invitation_threshold);
    current.invitation_threshold=Number.isFinite(threshold)?Math.max(0,Math.min(100,threshold)):20;
    if(!Array.isArray(current.preferred_activities))current.preferred_activities=[];
  }
  return character.social_preferences;
}
function relationshipMilestoneRule(level){
  return PA_RELATIONSHIP_MILESTONES.find(rule=>rule.level===+level)||null;
}
function defaultRelationshipStoryPlan(character,level=1){
  return {status:'draft',primary_location:character?.home?.location_id||'',
    conflict:'',important_choice:'',consequence:'',callback:'',
    supporting_characters:[],required_memories:[],prerequisite_quests:[],notes:'',level:+level||1};
}
function normalizeRelationshipChapterStory(character,chapter){
  if(!PA_RELATIONSHIP_ROUTES.some(route=>route.id===chapter.route))chapter.route='shared';
  const current=chapter.story_plan;
  chapter.story_plan=current&&typeof current==='object'&&!Array.isArray(current)
    ?current:defaultRelationshipStoryPlan(character,chapter.level);
  const plan=chapter.story_plan,defaults=defaultRelationshipStoryPlan(character,chapter.level);
  Object.keys(defaults).forEach(key=>{
    if(plan[key]===undefined)plan[key]=Array.isArray(defaults[key])?defaults[key].slice():defaults[key];
  });
  if(!PA_STORY_STATUSES.includes(plan.status))plan.status='draft';
  ['supporting_characters','required_memories','prerequisite_quests'].forEach(key=>{
    if(!Array.isArray(plan[key]))plan[key]=[];
  });
  plan.level=+chapter.level||1;
  return plan;
}

let P={characters:[],locations:[],content:[],districts:[],travel:null,aliases:{},dismissedBundledCharacters:[]};
let sel=null, selChar=null, selPlace=null, focusPath=[], stageIx=0;
let mode='play', busy=false, abort=null, fmt='sheets';

const slug=s=>String(s).toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'')||'x';
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const dress=s=>esc(s).replace(/\*([^*\n]+)\*/g,'<em class="dir">$1</em>');
const pretty=s=>String(s??'').replace(/_/g,' ');
/** Conversations and activities may be offered on several days. `day` remains
    the primary/legacy day so schedules and older project files keep working. */
function contentDays(c){
  const raw=Array.isArray(c?.days)?c.days:(c?.day?[c.day]:[]);
  return [...new Set(raw.filter(d=>DAYS.includes(d)))];
}
function setContentDays(c,days){
  c.days=[...new Set((days||[]).filter(d=>DAYS.includes(d)))];
  c.day=c.days[0]||'';
}
function setContentBlock(c,block){
  c.block=BLOCKS.includes(block)?block:'';
  if(c.type==='activity')c.blocks=c.block?[c.block]:[];
}
/** Renames content and keeps the modeled references that use an activity id in
    sync. Custom counter keys stay custom; only the default derived key follows. */
function renameContentId(c,raw){
  const old=c.id,next=slug(raw),ambiguous=P.content.some(x=>x!==c&&x.id===old);
  c.id=next;
  if(old===next)return next;
  const rewriteEffects=target=>{
    if(c.type!=='activity'||!Array.isArray(target?.effects))return;
    target.effects.forEach(e=>{
      if(e?.operation==='complete_activity'&&e.value===old)e.value=next;
    });
  };
  const scan=list=>(list||[]).forEach(n=>{
    if(n.type==='jump'&&n.target===old&&
      (n._map_target_uid===c.uid||(!n._map_target_uid&&!ambiguous)))n.target=next;
    rewriteEffects(n);rewriteEffects(n._orig);
    if(n.type==='choice'||n.type==='gate')(n.options||[]).forEach(o=>{
      rewriteEffects(o);rewriteEffects(o._orig);scan(o.nodes);
    });
  });
  P.content.forEach(item=>{
    if(item.type==='quest'||item.type==='activity')(item.stages||[]).forEach(s=>scan(s.nodes));
    else scan(item.nodes);
  });
  if(c.type==='quest'){
    P.content.filter(x=>x.type==='quest'&&x.after===old).forEach(x=>x.after=next);
    allTextMessages().forEach(({message})=>{
      const trigger=message.trigger||{};
      if(trigger.quest_started===old)trigger.quest_started=next;
      if(trigger.quest_completed===old)trigger.quest_completed=next;
      ['objective_completed','hours_after_quest'].forEach(key=>{
        if(Array.isArray(trigger[key])&&trigger[key][0]===old)trigger[key][0]=next;
      });
      const rewriteEffect=effect=>{
        if(!effect||typeof effect!=='object')return;
        if(effect.quest===old)effect.quest=next;
        if(effect.valid_quest===old)effect.valid_quest=next;
        if(['start_quest','complete_quest'].includes(effect.operation)&&effect.value===old)effect.value=next;
      };
      (message.effects||[]).forEach(rewriteEffect);
      (message.quick_replies||[]).forEach(reply=>(reply.effects||[]).forEach(rewriteEffect));
      if(message._quest_id===old)message._quest_id=next;
    });
  }
  if(c.type!=='activity')return next;
  const oldDefault='activity.'+old+'.count';
  if(!c.counterKey||c.counterKey===oldDefault)c.counterKey='activity.'+next+'.count';
  if(c._authored?.counter_key===oldDefault)c._authored.counter_key=c.counterKey;
  if(c._authored?.source?.counter_key===oldDefault)c._authored.source.counter_key=c.counterKey;
  if(c._authored?.source)c._authored.source.id=next;
  P.content.filter(x=>x.type==='quest').forEach(q=>(q.stages||[]).forEach(s=>{
    const rules=[
      ['completion','completion'],
      ['hiddenUntil','hidden_until']
    ];
    rules.forEach(([field,authoredField])=>{
      const rule=s[field]||(s._authored&&s._authored[authoredField]);
      if(rule?.event!=='activity_count_at_least'||rule.activity!==old)return;
      rule.activity=next;s[field]=rule;
      if(s._authored?.[authoredField])s._authored[authoredField]=rule;
    });
  }));
  return next;
}
const cur=()=>P.content.find(c=>c.uid===sel);

/** Finds the quest whose id makes it the story arc for one relationship chapter. */
function relationshipChapterQuest(character,chapter){
  if(!character||!chapter?.id)return null;
  return P.content.find(item=>item.type==='quest'&&item.id===chapter.id&&
    (item.character===character.id||(item.cast||[]).includes(character.id)))||null;
}

/** Makes a writer-ready quest for a chapter. Its chapter requirement prevents
    the arc from being discovered before the runtime milestone is reached. */
function ensureRelationshipChapterQuest(character,chapter){
  const existing=relationshipChapterQuest(character,chapter);
  if(existing)return {quest:existing,created:false};
  const collision=P.content.find(item=>item.type==='quest'&&item.id===chapter.id);
  if(collision)throw new Error('Quest id "'+chapter.id+'" already belongs to '+
    (collision.title||'another quest')+'. Give this chapter a unique id first.');
  const location=character.home?.location_id||P.locations[0]?.id||'';
  const level=+chapter.level||1;
  const quest={uid:'u'+Date.now().toString(36)+Math.random().toString(36).slice(2,5),
    type:'quest',id:chapter.id,title:chapter.title||pretty(chapter.id),
    character:character.id,hook:'Write the relationship story for chapter '+level+'.',
    location,day:'',block:'',cast:[],premise:'',
    requires:[{type:'chapter',character:character.id,key:'',op:'gte',value:level}],
    stages:[{id:'objective_1',title:'Write the first story objective',location,nodes:[],flag:'',requires:[]}],
    questPlan:{category:'relationship',summary:'Write the relationship story for chapter '+level+'.',
      rewards:'',rewardRows:[{character:character.id,reward:'relationship:trust',value:1}],
      advancedRewards:'',participants:[],deadline:'',branchIdeas:'',event:null,eventDraft:null}};
  P.content.push(quest);
  return {quest,created:true};
}
const NARRATOR={id:'__narrator__',name:'Narration',color:'#938599'};
/** Port Alder creates this person from the user's choices for every new save.
    It is an authoring reference, never a .character package. */
const RUNTIME_PLAYER=Object.freeze({
  id:'player',name:'Player',display_name:'Player',color:'#D7B46F',_runtime_player:true,
  profile:Object.freeze({is_player:true,role:'runtime_player',romance_eligible:false}),
  personality:Object.freeze({traits:[],values:[],social_style:''}),
  boundaries:Object.freeze({hard_limits:[]}),relationship_defaults:Object.freeze({})
});
const isRuntimePlayerId=id=>id==='player'||id==='__player__';
/** Legacy fixed-player sheets remain recognisable so they can be ignored on export. */
function isPlayer(c){return !!c&&(c._runtime_player===true||isRuntimePlayerId(c.id)||c.profile?.is_player===true);}
function playerChar(){return RUNTIME_PLAYER;}
const npcs=()=>P.characters.filter(c=>!isPlayer(c));
const INITIAL_PHONE_CONTACTS=Object.freeze([
  'elena_reyes_hale','daniel_hale','lily_hale','emma_rowan','marcus_lee'
]);
const authoredChr=id=>P.characters.find(c=>c.id===id)||null;
const chr=id=>id==='__narrator__'?NARRATOR:isRuntimePlayerId(id)?RUNTIME_PLAYER:authoredChr(id);
const loc=id=>P.locations.find(l=>l.id===id);

/** Phone messages live on their owning NPC sheet, not in the scene tree. */
function allTextMessages(){
  const out=[];
  npcs().forEach(owner=>(Array.isArray(owner.text_messages)?owner.text_messages:[]).forEach((message,index)=>{
    if(message&&typeof message==='object')out.push({owner,message,index});
  }));
  return out;
}
const textMessageById=id=>allTextMessages().find(entry=>entry.message.id===id)||null;
const textMessageDirection=message=>message?.direction||
  (message?.sender==='player'?'outgoing':'incoming');
function ensureTextMessages(owner){
  if(owner&&!Array.isArray(owner.text_messages))owner.text_messages=[];
  return owner?.text_messages||[];
}

/** Renames a message without stranding quest objectives or follow-up triggers. */
function renameTextMessageId(owner,message,raw){
  if(!owner||!message)return '';
  const old=String(message.id||''),next=slug(raw);
  if(!next||next===old)return old;
  if(allTextMessages().some(entry=>entry.message!==message&&entry.message.id===next))return old;
  message.id=next;
  allTextMessages().forEach(({message:other})=>{
    const trigger=other.trigger||{};
    ['message_sent','message_replied','text_sent','text_replied'].forEach(key=>{
      if(trigger[key]===old)trigger[key]=next;
      else if(Array.isArray(trigger[key])&&trigger[key][1]===old)trigger[key][1]=next;
    });
    if(Array.isArray(trigger.reply_selected)&&trigger.reply_selected[0]===old)
      trigger.reply_selected[0]=next;
  });
  P.content.filter(c=>c.type==='quest').forEach(q=>{
    (q.stages||[]).forEach(stage=>{
      const rules=[stage.completion,stage.hiddenUntil,stage._authored?.completion,
        stage._authored?.hidden_until].filter(Boolean);
      rules.forEach(rule=>{
        if(rule.event==='text_replied'&&rule.thread===old)rule.thread=next;
        if(rule.event==='text_replied'&&rule.message===old)rule.message=next;
        if(rule.event==='text_sent'&&rule.message===old)rule.message=next;
        if(rule.event==='text_received'&&rule.message===old)rule.message=next;
      });
    });
    if(q.questPlan?.phoneOfferMessageId===old)q.questPlan.phoneOfferMessageId=next;
  });
  return next;
}

/** State-value shorthand used by imported Port Alder content: player.life_path=college. */
function stateScalar(raw){
  const value=String(raw??'').trim();
  if(value==='true')return true;
  if(value==='false')return false;
  if(value==='null')return null;
  if(/^-?(?:\d+|\d*\.\d+)$/.test(value))return Number(value);
  return value.replace(/^(["'])([\s\S]*)\1$/,'$2');
}
function stateAssignment(raw){
  const text=String(raw??'').trim(),at=text.indexOf('=');
  if(at<1)return null;
  const key=text.slice(0,at).trim();
  return key?{key,value:stateScalar(text.slice(at+1))}:null;
}
function stateValueText(value){
  if(value===null)return 'null';
  if(typeof value==='boolean'||typeof value==='number')return String(value);
  return String(value??'');
}

let disk={get:()=>null,set:()=>{}};
try{localStorage.setItem('__t','1');localStorage.removeItem('__t');
 disk={get:()=>{try{return JSON.parse(localStorage.getItem('scenewright2'))}catch{return null}},
       set:v=>{try{localStorage.setItem('scenewright2',JSON.stringify(v))}catch{}}};}catch{}
const save=()=>{P.districts=DISTRICTS;P.travel=TRAVEL;P.aliases=ALIASES;disk.set(P);};
