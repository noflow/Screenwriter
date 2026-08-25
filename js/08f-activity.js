/* ---- repeatable activities with milestones ---- */
function paintActivity(c){
  c.stages=c.stages||[{id:'base',title:'Every time',at:0,nodes:[],flag:'',requires:[],once:false}];
  stageIx=Math.min(stageIx,c.stages.length-1);
  const key='activity.'+c.id+'.count';

  $('treeInner').innerHTML=slugline(c)+
    '<p class="hint" style="margin-bottom:14px">Counter <code>'+esc(key)+'</code> rises each time. '+
    'Milestones are checked highest-first, so the most specific one wins.</p>'+
    c.stages.map((s,i)=>{
      const isBase=i===0;
      return '<div class="stagecard'+(i===stageIx?' on':'')+(isBase?'':' ms')+'" data-s="'+i+'">'+
        '<div class="stagehead">'+
        (isBase?'<span class="n">every time</span>'
          :'<span class="n">on the</span><input class="atn" type="number" min="1" value="'+
           (+s.at||1)+'" data-at="'+i+'"><span class="n">th time</span>')+
        '<input value="'+esc(s.title)+'" data-st="'+i+'">'+
        (isBase?'':'<label class="n" style="display:flex;align-items:center;gap:4px;cursor:pointer">'+
          '<input type="checkbox" data-once="'+i+'"'+(s.once!==false?' checked':'')+'> once</label>')+
        '<input value="'+esc(s.flag||'')+'" placeholder="sets flag" data-sf="'+i+'" style="width:118px">'+
        '<button class="btn" data-sw="'+i+'">'+(i===stageIx?'writing':'write here')+'</button>'+
        (isBase?'':'<button class="btn" data-sx="'+i+'">×</button>')+'</div>'+
        (isBase?'':'<div class="optcond" style="margin-bottom:8px">'+condEditor(s.requires,'stage:'+i)+'</div>')+
        (s.nodes.length?renderList(s.nodes,[]):'<p class="empty" style="padding:4px 2px">No lines yet.</p>')+
      '</div>';
    }).join('')+
    '<button class="btn wide" id="addMs">+ milestone</button>';

  if(c.stages[stageIx])wireTree();
  const T=$('treeInner');
  T.querySelectorAll('[data-st]').forEach(el=>el.oninput=()=>{c.stages[+el.dataset.st].title=el.value;save()});
  T.querySelectorAll('[data-sf]').forEach(el=>el.oninput=()=>{c.stages[+el.dataset.sf].flag=el.value;save()});
  T.querySelectorAll('[data-at]').forEach(el=>el.onchange=()=>{
    c.stages[+el.dataset.at].at=Math.max(1,parseInt(el.value,10)||1);
    // keep milestones ordered so the highest-first check reads naturally
    const base=c.stages[0],ms=c.stages.slice(1).sort((a,b)=>(+a.at)-(+b.at));
    c.stages=[base,...ms];save();paintBody();});
  T.querySelectorAll('[data-once]').forEach(el=>el.onchange=()=>{
    c.stages[+el.dataset.once].once=el.checked;save()});
  T.querySelectorAll('[data-sw]').forEach(b=>b.onclick=()=>{stageIx=+b.dataset.sw;focusPath=[];paintBody()});
  T.querySelectorAll('[data-sx]').forEach(b=>b.onclick=()=>{
    c.stages.splice(+b.dataset.sx,1);stageIx=0;save();paintBody()});
  $('addMs').onclick=()=>{
    const highest=Math.max(0,...c.stages.slice(1).map(s=>+s.at||0));
    c.stages.push({id:'ms_'+(c.stages.length),title:'New milestone',at:highest+1,
      nodes:[],flag:'',requires:[],once:true});
    stageIx=c.stages.length-1;save();paintBody();};
  $('counter').textContent=(c.stages.length-1)+' milestones';paintModes();
}
