function paintBody(){
  const c=cur(),inner=$('treeInner');
  if(!c){inner.innerHTML='<div class="blank"><h2>Nothing open</h2><p>Import your character sheets, then make a '+
    'conversation, quest, or repeatable from the Content tab. Locations build themselves from each sheet\'s '+
    'home and schedule.</p></div>';$('counter').textContent='';paintModes();return;}

  if(c.type==='repeatable') return paintPool(c);
  if(c.type==='activity')   return paintActivity(c);
  if(c.type==='quest')      return paintQuest(c);
  return paintTree(c);
}

function slugline(c){
  const l=loc(locPart(c.location)),ch=(chr(c.character)||chr(c.cast?.[0]))?.relationship_chapters?.find(x=>x.level===+c.chapter);
  return '<div class="slug"><span><b>'+esc(c.id||'no_id')+'</b></span>'+
    '<span>'+esc(c.location?placeName(c.location):'no location')+'</span>'+
    '<span>'+esc(pretty(c.day))+' · '+esc(pretty(c.block))+'</span>'+
    (ch?'<span>ch '+ch.level+' · '+esc(ch.title)+'</span>':'')+
    '<span>'+(c.cast||[]).map(id=>esc(chr(id)?.name||id)).join(', ')+'</span></div>';
}

function paintTree(c){
  const inner=$('treeInner');
  if(!c.nodes.length){
    inner.innerHTML=slugline(c)+'<div class="blank"><h2>Empty</h2><p>Pick who\'s present above, then write the first beat.</p></div>';
    $('counter').textContent='0 lines';paintModes();return;
  }
  inner.innerHTML=slugline(c)+renderList(c.nodes,[]);
  wireTree();$('counter').textContent=countLines(c.nodes)+' lines';paintModes();
}

function renderList(list,path){
  return list.map((n,i)=>{
    const p=path.concat(i);
    if(n.type==='line'){
      const c=chr(n.speaker)||{name:n.speaker||'?',color:'#938599'};
      const narr=n.speaker==='__narrator__';
      const pcline=isPlayer(chr(n.speaker));
      return '<div class="node'+(narr?' narr':'')+(pcline?' pcline':'')+'" data-p="'+p.join('.')+'"><div class="tools">'+
        '<button data-act="up">↑</button><button data-act="down">↓</button>'+
        '<button data-act="addline">+line</button>'+
        '<button data-act="fork">fork</button><button data-act="narrate">narrate</button>'+
        '<button data-act="jump">jump</button><button data-act="del">del</button></div>'+
        '<div class="line-node"><div class="who-l" data-act="speaker" style="color:'+c.color+'">'+esc(c.name)+
        (n.emotion?'<span class="emo">'+esc(n.emotion)+'</span>':'')+'</div>'+
        '<div class="said" contenteditable="plaintext-only" data-act="text">'+dress(n.text)+'</div></div></div>';
    }
    if(n.type==='jump'){
      const opts=P.content.filter(x=>x.uid!==cur().uid).map(x=>
        '<option value="'+esc(x.id)+'"'+(x.id===n.target?' selected':'')+'>'+
        esc(x.title||x.id)+' ('+x.type+')</option>').join('');
      return '<div class="node" data-p="'+p.join('.')+'"><div class="tools">'+
        '<button data-act="up">↑</button><button data-act="down">↓</button>'+
        '<button data-act="del">del</button></div>'+
        '<div class="jump-node"><span class="arrow">jump to →</span>'+
        '<select data-jump="'+p.join('.')+'"><option value="">— pick content —</option>'+opts+'</select></div></div>';
    }
    if(n.type==='gate'){
      return '<div class="node" data-p="'+p.join('.')+'"><div class="tools">'+
        '<button data-act="up">↑</button><button data-act="down">↓</button>'+
        '<button data-act="del">del</button></div>'+
        '<div class="choice-node"><div class="choice-head">Automatic stat outcome</div>'+
        n.options.map((o,j)=>{
          const h=path.concat(i,j),on=h.join('.')===focusPath.join('.');
          return '<div class="branch'+(on?' on':'')+'"><div class="branch-head">'+
            '<input class="opt-text" value="'+esc(o.text)+'" data-opt="'+h.join('.')+'">'+
            '<button class="branch-here" data-here="'+h.join('.')+'">'+(on?'writing here':'write here')+'</button>'+
            '<button class="branch-rewrite" data-rewrite="'+h.join('.')+'">rewrite</button>'+
            '</div><div class="optcond">'+condEditor(o.requires,'opt:'+h.join('.'))+
            '<input class="flag" placeholder="effects — trust +1" value="'+esc(o.flag||'')+'" data-flag="'+h.join('.')+'"></div>'+
            renderList(o.nodes,h)+'</div>';
        }).join('')+'</div></div>';
    }
    return '<div class="node" data-p="'+p.join('.')+'"><div class="tools">'+
      '<button data-act="up">↑</button><button data-act="down">↓</button>'+
      '<button data-act="addopt">+ option</button><button data-act="del">del</button></div>'+
      '<div class="choice-node"><div class="choice-head">Player chooses</div>'+
      n.options.map((o,j)=>{
        const h=path.concat(i,j),on=h.join('.')===focusPath.join('.');
        return '<div class="branch'+(on?' on':'')+'"><div class="branch-head">'+
          '<input class="opt-text" value="'+esc(o.text)+'" data-opt="'+h.join('.')+'">'+
          '<input class="flag" placeholder="trust +1" value="'+esc(o.flag||'')+'" data-flag="'+h.join('.')+'">'+
          '<button class="branch-go" data-cont="'+h.join('.')+'">'+
            ((o.nodes||[]).length?'continue':'write this branch')+'</button>'+
          ((o.nodes||[]).length?'<button class="branch-rewrite" data-rewrite="'+h.join('.')+'">rewrite</button>':'')+
          '<button class="branch-here" data-here="'+h.join('.')+'">'+(on?'writing here':'write here')+'</button>'+
          '</div><div class="optcond">'+condEditor(o.requires,'opt:'+h.join('.'))+'</div>'+
          renderList(o.nodes,h)+'</div>';
      }).join('')+'</div></div>';
  }).join('');
}

function wireTree(){
  const inner=$('treeInner');
  inner.querySelectorAll('[data-act="text"]').forEach(el=>{
    el.onblur=()=>{nodeAt(el.closest('.node').dataset.p.split('.').map(Number)).text=el.innerText.trim();save();};
    el.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();el.blur();}};});
  inner.querySelectorAll('[data-act="speaker"]').forEach(el=>el.onclick=()=>{
    const n=nodeAt(el.closest('.node').dataset.p.split('.').map(Number));
    // Narration sits at the end of the cycle so one more click always reaches it.
    let pool=(cur().cast?.length?cur().cast:P.characters.map(c=>c.id));
    const pc=playerChar();
    if($('writePlayer')?.checked&&pc&&!pool.includes(pc.id))pool=[pc.id].concat(pool);
    if(!$('writePlayer')?.checked)pool=pool.filter(id=>!isPlayer(chr(id)));
    pool=pool.concat('__narrator__');
    n.speaker=pool[(pool.indexOf(n.speaker)+1)%pool.length];save();paintBody();});
  inner.querySelectorAll('.tools button').forEach(b=>b.onclick=()=>
    act(b.dataset.act,b.closest('.node').dataset.p.split('.').map(Number)));
  inner.querySelectorAll('[data-opt]').forEach(el=>el.oninput=()=>{
    optAt(el.dataset.opt.split('.').map(Number)).text=el.value;save()});
  inner.querySelectorAll('[data-flag]').forEach(el=>el.oninput=()=>{
    optAt(el.dataset.flag.split('.').map(Number)).flag=el.value;save()});
  inner.querySelectorAll('[data-cont]').forEach(b=>b.onclick=async()=>{
    if(busy)return;
    const p=b.dataset.cont.split('.').map(Number);
    busy=true;$('go').disabled=true;$('stop').disabled=false;abort=new AbortController();
    b.textContent='writing…';
    try{
      const n=await continueBranch(p,abort.signal);
      save();paintBody();
      note(n?'Added '+n+' line'+(n===1?'':'s')+' to that branch.':'Nothing came back.',!n);
    }catch(e){
      if(e.name!=='AbortError')note('Could not continue: '+esc(e.message),true);
    }finally{busy=false;$('go').disabled=false;$('stop').disabled=true;abort=null;paintBody();}
  });
  inner.querySelectorAll('[data-rewrite]').forEach(b=>b.onclick=async()=>{
    if(busy)return;
    const p=b.dataset.rewrite.split('.').map(Number),o=optAt(p),old=o.nodes.slice();
    if(!old.length)return;
    busy=true;$('go').disabled=true;$('stop').disabled=false;abort=new AbortController();
    o.nodes=[];b.textContent='rewriting…';
    try{
      const n=await continueBranch(p,abort.signal,'Rewrite this branch from scratch. Keep its condition and outcome distinct.');
      if(!n)o.nodes=old;
      save();paintBody();note(n?'Rewrote that branch.':'Kept the old branch because no replacement came back.',!n);
    }catch(e){o.nodes=old;if(e.name!=='AbortError')note('Could not rewrite: '+esc(e.message),true);}
    finally{busy=false;$('go').disabled=false;$('stop').disabled=true;abort=null;paintBody();}
  });
  inner.querySelectorAll('[data-here]').forEach(b=>b.onclick=()=>{
    const h=b.dataset.here.split('.').map(Number);
    focusPath=focusPath.join('.')===h.join('.')?[]:h;paintBody();});
  inner.querySelectorAll('[data-jump]').forEach(el=>el.onchange=()=>{
    nodeAt(el.dataset.jump.split('.').map(Number)).target=el.value;save();});
  wireConds(inner);
}

function act(a,p){
  const list=listAt(p.slice(0,-1)),i=p[p.length-1];
  if(a==='del')list.splice(i,1);
  if(a==='up'&&i>0)list.splice(i-1,0,list.splice(i,1)[0]);
  if(a==='down'&&i<list.length-1)list.splice(i+1,0,list.splice(i,1)[0]);
  if(a==='addopt')list[i].options.push({text:'New option',flag:'',nodes:[]});
  if(a==='addline'){
    const prev=list[i];
    const sp=(prev&&prev.speaker&&prev.speaker!=='__narrator__')?prev.speaker
      :(speakerPool()[0]||'__narrator__');
    list.splice(i+1,0,{type:'line',speaker:sp,text:'',emotion:''});
  }
  if(a==='narrate')list.splice(i+1,0,{type:'line',speaker:'__narrator__',
    text:'Describe what happens here.',emotion:''});
  if(a==='jump')list.splice(i+1,0,{type:'jump',target:''});
  if(a==='fork')list.splice(i+1,0,{type:'choice',options:[
    {text:'Option one',flag:'',nodes:[]},{text:'Option two',flag:'',nodes:[]}]});
  focusPath=[];save();paintBody();
}
