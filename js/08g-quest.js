/* ---- quest stages ---- */
function paintQuest(c){
  c.stages=c.stages||[];
  if(!c.stages.length)c.stages.push({id:'stage_1',title:'Opening',location:c.location||'',nodes:[],flag:''});
  stageIx=Math.min(stageIx,c.stages.length-1);
  const lopts=v=>placeOptions(v);

  $('treeInner').innerHTML=slugline(c)+c.stages.map((s,i)=>
    '<div class="stagecard'+(i===stageIx?' on':'')+'" data-s="'+i+'">'+
      '<div class="stagehead"><span class="n">stage '+(i+1)+'</span>'+
      '<input value="'+esc(s.title)+'" data-st="'+i+'">'+
      '<select data-sl="'+i+'">'+lopts(s.location)+'</select>'+
      '<input value="'+esc(s.flag||'')+'" placeholder="sets flag" data-sf="'+i+'" style="width:120px">'+
      '<button class="btn" data-sw="'+i+'">'+(i===stageIx?'writing':'write here')+'</button>'+
      '<button class="btn" data-sx="'+i+'">×</button></div>'+
      completionEditor(s,i)+
      '<div class="optcond" style="margin-bottom:8px">'+condEditor(s.requires,'stage:'+i)+'</div>'+
      (s.nodes.length?renderList(s.nodes,[]):'<p class="empty" style="padding:4px 2px">No lines yet.</p>')+
    '</div>').join('')+
    '<button class="btn wide" id="addStage">+ add stage</button>';

  if(c.stages[stageIx])wireTree();
  wireCompletion($('treeInner'));
  $('treeInner').querySelectorAll('[data-st]').forEach(el=>el.oninput=()=>{c.stages[+el.dataset.st].title=el.value;save()});
  $('treeInner').querySelectorAll('[data-sl]').forEach(el=>el.onchange=()=>{c.stages[+el.dataset.sl].location=el.value;save()});
  $('treeInner').querySelectorAll('[data-sf]').forEach(el=>el.oninput=()=>{c.stages[+el.dataset.sf].flag=el.value;save()});
  $('treeInner').querySelectorAll('[data-sw]').forEach(b=>b.onclick=()=>{stageIx=+b.dataset.sw;focusPath=[];paintBody()});
  $('treeInner').querySelectorAll('[data-sx]').forEach(b=>b.onclick=()=>{
    if(c.stages.length<2)return;c.stages.splice(+b.dataset.sx,1);stageIx=0;save();paintBody()});
  $('addStage').onclick=()=>{c.stages.push({id:'stage_'+(c.stages.length+1),title:'New stage',
    location:c.location||'',nodes:[],flag:''});stageIx=c.stages.length-1;save();paintBody()};
  $('counter').textContent=c.stages.length+' stages';paintModes();
}
