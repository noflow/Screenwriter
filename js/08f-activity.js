/* ---- repeatable activities with milestones ---- */
function paintActivity(c){
  c.stages=c.stages||[{id:'base',title:'Every time',at:0,nodes:[],flag:'',requires:[],once:false}];
  stageIx=Math.min(stageIx,c.stages.length-1);
  const key=activityCounterKey(c);
  const countMode=c.incrementsOn||c._authored?.increments_on||'completed';
  const legacyMilestones=(c.milestoneSemantics||c._authored?.milestone_semantics)==='projected_attempt';
  const repeatLimit=activityRepeatLimit(c);
  const category=Object.prototype.hasOwnProperty.call(c,'category')?c.category:(c._authored?.category||'');

  $('treeInner').innerHTML=slugline(c)+
    '<div class="activity-rule"><div><b>Successful completion counter</b><p>Counter <code>'+esc(key)+'</code> '+
    'controls the milestones below.</p></div><label>Count when <select id="activityCountMode">'+
      '<option value="explicit_success"'+(countMode==='explicit_success'?' selected':'')+'>a marked successful branch is chosen</option>'+
      (countMode==='completed'?'<option value="completed" selected>the whole activity finishes (imported legacy)</option>':'')+
    '</select></label><label>Repeat <select id="activityRepeatLimit">'+
      '<option value="once_per_block"'+(repeatLimit==='once_per_block'?' selected':'')+'>once per time block</option>'+
      '<option value="once_per_day"'+(repeatLimit==='once_per_day'?' selected':'')+'>once per day</option>'+
      '<option value="once_per_week"'+(repeatLimit==='once_per_week'?' selected':'')+'>once per week</option>'+
      '<option value=""'+(!repeatLimit?' selected':'')+'>no repeat limit</option>'+
    '</select></label></div>'+
    '<div class="activity-meta"><label>Name <input id="activityName" value="'+
      esc(activityName(c))+'" placeholder="Watch TV together"></label>'+
      '<label>Category <input id="activityCategory" value="'+esc(category)+'" placeholder="family_time"></label>'+
      '<label class="summary">Summary <input id="activitySummary" value="'+esc(c.premise||'')+'" '+
      'placeholder="What the player does and why it matters"></label></div>'+
    (countMode==='explicit_success'?'<p class="hint success-help">Mark the accepting or completed choice with <b>Counts as success</b>. '+
      'Refusals and failed stat outcomes will not advance the counter.</p>':'')+
    c.stages.map((s,i)=>{
      const isBase=i===0;
      return '<div class="stagecard'+(i===stageIx?' on':'')+(isBase?'':' ms')+'" data-s="'+i+'">'+
        '<div class="stagehead">'+
        (isBase?'<span class="n">ordinary visit</span>'
          :legacyMilestones?'<span class="n">on attempt</span><input class="atn" type="number" min="1" value="'+
           (+s.at||1)+'" data-at="'+i+'">':'<span class="n">after</span><input class="atn" type="number" min="1" value="'+
           (+s.at||1)+'" data-at="'+i+'"><span class="n">successful completions</span>')+
        (isBase?'':'<input class="stage-id" value="'+esc(s.id||'')+'" data-sid="'+i+'" title="Milestone export id">')+
        '<input value="'+esc(s.title)+'" data-st="'+i+'">'+
        (isBase?'':'<label class="n" style="display:flex;align-items:center;gap:4px;cursor:pointer">'+
          '<input type="checkbox" data-once="'+i+'"'+(s.once!==false?' checked':'')+'> once</label>')+
        '<input value="'+esc(s.flag||'')+'" placeholder="sets flag" data-sf="'+i+'" style="width:118px">'+
        '<button class="btn" data-sw="'+i+'">'+(i===stageIx?'writing':'write here')+'</button>'+
        '<button class="btn quiet" data-plan-stage="'+i+'">Plan scene</button>'+
        (isBase?'':'<button class="btn" data-sx="'+i+'">×</button>')+'</div>'+
        (isBase?'':'<div class="optcond" style="margin-bottom:8px">'+condEditor(s.requires,'stage:'+i)+'</div>')+
        (i===stageIx
          ?(s.nodes.length?renderList(s.nodes,[]):'<p class="empty" style="padding:4px 2px">No lines yet.</p>')
          :'<p class="hint" style="padding:4px 2px">'+countLines(s.nodes||[])+' lines · choose “write here” to edit this stage.</p>')+
      '</div>';
    }).join('')+
    '<button class="btn wide" id="addMs">+ milestone</button>';

  if(c.stages[stageIx])wireTree();
  const T=$('treeInner');
  $('activityName').oninput=e=>{c.name=e.target.value;save();};
  $('activityCategory').oninput=e=>{c.category=e.target.value.trim();save();};
  $('activitySummary').oninput=e=>{c.premise=e.target.value;save();};
  $('activityCountMode').onchange=e=>{
    c.incrementsOn=e.target.value;
    if(c.incrementsOn==='explicit_success')c.milestoneSemantics='after_successes';
    save();paintBody();
  };
  $('activityRepeatLimit').onchange=e=>{c.repeatLimit=e.target.value;save();};
  T.querySelectorAll('[data-st]').forEach(el=>el.oninput=()=>{c.stages[+el.dataset.st].title=el.value;save()});
  T.querySelectorAll('[data-sid]').forEach(el=>el.oninput=()=>{
    c.stages[+el.dataset.sid].id=slug(el.value);save();
  });
  T.querySelectorAll('[data-sf]').forEach(el=>el.oninput=()=>{c.stages[+el.dataset.sf].flag=el.value;save()});
  T.querySelectorAll('[data-at]').forEach(el=>el.onchange=()=>{
    const edited=c.stages[+el.dataset.at];
    edited.at=Math.max(1,parseInt(el.value,10)||1);
    // keep milestones ordered so the highest-first check reads naturally
    const base=c.stages[0],ms=c.stages.slice(1).sort((a,b)=>(+a.at)-(+b.at));
    c.stages=[base,...ms];stageIx=c.stages.indexOf(edited);save();paintBody();});
  T.querySelectorAll('[data-once]').forEach(el=>el.onchange=()=>{
    c.stages[+el.dataset.once].once=el.checked;save()});
  T.querySelectorAll('[data-sw]').forEach(b=>b.onclick=()=>{stageIx=+b.dataset.sw;focusPath=[];paintBody()});
  T.querySelectorAll('[data-plan-stage]').forEach(b=>b.onclick=()=>{
    stageIx=+b.dataset.planStage;focusPath=[];openPlanner();
  });
  T.querySelectorAll('[data-sx]').forEach(b=>b.onclick=()=>{
    c.stages.splice(+b.dataset.sx,1);stageIx=0;save();paintBody()});
  $('addMs').onclick=()=>{
    const highest=Math.max(0,...c.stages.slice(1).map(s=>+s.at||0));
    c.stages.push({id:'ms_'+(c.stages.length),title:'New milestone',at:highest+1,
      nodes:[],flag:'',requires:[],once:true});
    stageIx=c.stages.length-1;save();paintBody();};
  $('counter').textContent=(c.stages.length-1)+' milestones';paintModes();
}
