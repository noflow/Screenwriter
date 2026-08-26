/* ============ quest and event builder ============ */
let qbQuest=null;

function newQuestForBuilder(){
  const uid='u'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);
  const c={uid,type:'quest',id:'quest_'+(P.content.filter(x=>x.type==='quest').length+1),title:'New quest',
    character:P.characters.find(c=>!isPlayer(c))?.id||'',hook:'',location:P.locations[0]?.id||'',
    day:'monday',block:'evening',cast:[],premise:'',requires:[],
    stages:[{id:'objective_1',title:'First objective',location:P.locations[0]?.id||'',nodes:[],flag:'',requires:[]}],
    questPlan:{category:'character_story',rewards:'',deadline:'',event:null}};
  P.content.push(c);sel=uid;focusPath=[];stageIx=0;return c;
}

function paintQuestObjectives(){
  const c=qbQuest;if(!c)return;
  $('qbObjectives').innerHTML='<p class="rubric later">Objectives</p>'+c.stages.map((s,i)=>
    '<div class="row" style="margin:5px 0"><span class="tag">'+(i+1)+'</span><input data-qbo="'+i+'" value="'+
      esc(s.title||'')+'" placeholder="What must the player do?"><button class="x" data-qbx="'+i+'">×</button></div>').join('');
  $('qbObjectives').querySelectorAll('[data-qbo]').forEach(el=>el.oninput=()=>{qbQuest.stages[+el.dataset.qbo].title=el.value;save();});
  $('qbObjectives').querySelectorAll('[data-qbx]').forEach(b=>b.onclick=()=>{
    if(qbQuest.stages.length<2)return;
    qbQuest.stages.splice(+b.dataset.qbx,1);qbQuest.stages.forEach((s,i)=>s.id='objective_'+(i+1));save();paintQuestObjectives();
  });
}

function openQuestBuilder(){
  qbQuest=cur()?.type==='quest'?cur():newQuestForBuilder();
  const c=qbQuest,p=c.questPlan||{};
  $('qbGiver').innerHTML='<option value="">— no specific giver —</option>'+P.characters.filter(x=>!isPlayer(x)).map(x=>
    '<option value="'+esc(x.id)+'">'+esc(x.name)+'</option>').join('');
  $('qbAfter').innerHTML='<option value="">— available immediately —</option>'+P.content.filter(x=>x.type==='quest'&&x!==c).map(x=>
    '<option value="'+esc(x.id)+'">'+esc(x.title||x.id)+'</option>').join('');
  $('qbEventLocation').innerHTML=placeOptions(p.event?.location||'');
  $('qbTitle').value=c.title||'';$('qbCategory').value=p.category||c._authored?.category||'character_story';
  $('qbGiver').value=c.character||'';$('qbSummary').value=p.summary||c.hook||c.premise||'';
  $('qbAfter').value=c.after||'';$('qbEarliest').value=p.earliestBlock||'';$('qbRewards').value=p.rewards||'';
  $('qbDeadline').value=p.deadline||'';$('qbEventTitle').value=p.event?.title||'';$('qbEventDate').value=p.event?.date||'';
  $('qbEventBlock').value=p.event?.block||'';paintQuestObjectives();$('questBuilder').showModal();$('qbTitle').focus();
}

function saveQuestPlan(){
  const c=qbQuest;if(!c)return;
  const block=$('qbEventBlock').value,date=$('qbEventDate').value.trim();
  const event=block&&date?{id:'event_'+c.id,title:$('qbEventTitle').value.trim()||c.title,date,
    block,location:$('qbEventLocation').value,participants:[c.character].filter(Boolean),source:c.id,type:'story_event'}:null;
  c.title=$('qbTitle').value.trim()||'Untitled quest';c.character=$('qbGiver').value;
  c.hook=$('qbSummary').value.trim();c.premise=c.hook;c.after=$('qbAfter').value;
  c.questPlan={category:$('qbCategory').value,summary:c.hook,earliestBlock:$('qbEarliest').value,
    rewards:$('qbRewards').value.trim(),deadline:$('qbDeadline').value.trim(),event};
  c.stages.forEach((s,i)=>{s.id='objective_'+(i+1);s.title=s.title.trim()||'Objective '+(i+1);});
  save();paintAll();$('questBuilder').close();note('Quest plan saved. Write each objective in its stage, then export the character sheet.');
}

$('openQuestBuilder').onclick=openQuestBuilder;
$('closeQuestBuilder').onclick=()=>$('questBuilder').close();
$('qbAddObjective').onclick=()=>{if(!qbQuest)return;const n=qbQuest.stages.length+1;
  qbQuest.stages.push({id:'objective_'+n,title:'Objective '+n,location:qbQuest.location||'',nodes:[],flag:'',requires:[]});save();paintQuestObjectives();};
$('saveQuestBuilder').onclick=saveQuestPlan;
