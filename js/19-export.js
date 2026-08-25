/* ============ export ============ */
function clean(l){return l.map(n=>n.type==='line'
  ?{type:'line',speaker:n.speaker,text:n.text,emotion:n.emotion||''}
  :n.type==='jump'?{type:'jump',target:n.target||''}
  :{type:'choice',options:n.options.map(o=>({text:o.text,flag:o.flag||'',
     requires:o.requires||[],nodes:clean(o.nodes)}))});}

function toJSON(){
  const pick=t=>P.content.filter(c=>c.type===t);
  return JSON.stringify({format:'scenewright.v2',
    characters:P.characters.map(c=>{
      const g=gameReady(c);
      return {id:c.id,name:c.name,color:c.color,
        age:g.profile?.age??null,
        romance_eligible:g.profile.romance_eligible,
        family_only:!!g.boundaries.family_only,
        hard_limits:g.boundaries.hard_limits||[],
        adult_hard_limits:g.private_profile?.adult_preferences?.hard_limits||[],
        chapters:(c.relationship_chapters||[]).map(x=>({level:x.level,id:x.id,title:x.title})),
        relationship_defaults:c.relationship_defaults||{}};
    }),
    locations:P.locations.map(l=>({id:l.id,name:l.name,background:l.background,district:l.district})),
    conversations:pick('conversation').map(c=>({id:c.id,title:c.title,location:c.location,
      day:c.day,block:c.block,cast:c.cast||[],chapter:+c.chapter||0,
      requires:c.requires||[],start:!!c.start,nodes:clean(c.nodes||[])})),
    quests:pick('quest').map(c=>({id:c.id,title:c.title,giver:c.character||'',hook:c.hook||'',
      requires:c.requires||[],
      stages:(c.stages||[]).map(s=>({id:s.id,title:s.title,location:s.location,
        sets_flag:s.flag||'',requires:s.requires||[],nodes:clean(s.nodes||[])}))})),
    repeatables:pick('repeatable').map(c=>({id:c.id,character:c.character,location:c.location,
      blocks:c.block?[c.block]:[],requires:c.requires||[],lines:(c.lines||[]).map(l=>
        ({text:l.text,emotion:l.emotion||'',min_chapter:+l.min_chapter||0}))}))},null,2);
}
function plain(l,pad){return l.map(n=>n.type==='line'
  ?pad+(chr(n.speaker)?.name||n.speaker).toUpperCase()+'\n'+pad+n.text
  :n.options.map((o,i)=>pad+'['+(i+1)+'] '+o.text+'\n'+plain(o.nodes,pad+'    ')).join('\n')).join('\n\n');}
function toScript(){
  return P.content.map(c=>{
    const h='== '+(c.title||c.id)+' ('+c.type+') ==\n';
    if(c.type==='repeatable')return h+'\n'+(c.lines||[]).map(l=>'· '+l.text).join('\n');
    if(c.type==='quest')return h+'\n'+(c.stages||[]).map((s,i)=>
      '-- stage '+(i+1)+': '+s.title+' --\n'+plain(s.nodes,'')).join('\n\n');
    return h+'\n'+plain(c.nodes||[],'');
  }).join('\n\n\n');
}
function toSheets(){
  if(!P.characters.length)return '// No characters imported.';
  return P.characters.map(c=>'// ---- '+c.id+'.character ----\n'+
    JSON.stringify(sheetOut(c),null,2)).join('\n\n');
}
const build=()=>fmt==='sheets'?toSheets():fmt==='json'?toJSON():toScript();
$('openMap').onclick=openMap;
$('openInspect').onclick=()=>openInspect();
$('openExport').onclick=()=>{$('dump').value=build();$('sheet').showModal()};
$('closeSheet').onclick=()=>$('sheet').close();
document.querySelectorAll('[data-fmt]').forEach(b=>b.onclick=()=>{fmt=b.dataset.fmt;
  document.querySelectorAll('[data-fmt]').forEach(x=>x.classList.toggle('on',x===b));$('dump').value=build();});
$('copyOut').onclick=()=>{navigator.clipboard.writeText($('dump').value);
  $('copyOut').textContent='Copied';setTimeout(()=>$('copyOut').textContent='Copy',1200)};
$('dlOut').onclick=()=>{
  if(fmt==='sheets'){
    P.characters.forEach((c,i)=>setTimeout(()=>{
      const url=URL.createObjectURL(new Blob([JSON.stringify(sheetOut(c),null,2)],
        {type:'application/json'}));
      Object.assign(document.createElement('a'),{href:url,download:c.id+'.character'}).click();
      URL.revokeObjectURL(url);},i*250));
    return;
  }
  const url=URL.createObjectURL(new Blob([$('dump').value],{type:'text/plain'}));
  Object.assign(document.createElement('a'),{href:url,download:'scenes.'+(fmt==='json'?'json':'txt')}).click();
  URL.revokeObjectURL(url)};

/* ============ new content ============ */
document.querySelectorAll('[data-new]').forEach(b=>b.onclick=()=>{
  const t=b.dataset.new,uid='u'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);
  const base={uid,type:t,id:t+'_'+(P.content.filter(c=>c.type===t).length+1),
    title:'New '+t,location:P.locations[0]?.id||'',day:'monday',block:'evening',
    chapter:1,cast:[],premise:''};
  if(t==='conversation')base.nodes=[];
  if(t==='quest'){base.stages=[{id:'stage_1',title:'Opening',location:base.location,nodes:[],flag:''}];
    base.character=P.characters[0]?.id||'';base.hook='';}
  if(t==='repeatable'){base.lines=[];base.character=P.characters[0]?.id||'';}
  if(t==='activity'){
    base.character=P.characters[0]?.id||'';
    base.cast=[base.character].filter(Boolean);
    base.stages=[{id:'base',title:'Every time',at:0,nodes:[],flag:'',requires:[],once:false}];
  }
  P.content.push(base);sel=uid;focusPath=[];stageIx=0;save();paintAll();
});

/* ============ import ============ */
async function pickFiles(){
  const i=Object.assign(document.createElement('input'),{type:'file',multiple:true});
  i.onchange=async()=>{
    const ok=[],bad=[];
    for(const f of i.files){
      try{
        const txt=await f.text(),d=JSON.parse(txt);
        if(d.format==='scenewright.project'){P=d.project;ok.push(f.name+' (project)');continue;}
        if(isLocationPackage(d)){const r=importLocations(d);
          ok.push(f.name+' — '+r.count+' locations, '+r.rooms+' rooms, '+r.districts+' districts'+
            (r.moved?', '+r.moved+' scenes remapped':'')+
            (r.sched?', '+r.sched+' schedule slots remapped':'')+
            (r.unplaced.length?'. '+r.unplaced.length+' schedule slot'+
              (r.unplaced.length===1?'':'s')+' need a real place — see Validate':''));
          if(r.lost.length)bad.push('could not place: '+r.lost.join(', '));
          continue;}
        if(!d.id&&!d.display_name){bad.push(f.name+' — no id or display_name, so it isn\'t a character sheet');continue;}
        ok.push(importSheet(d)+authoredNote(d));
      }catch(err){
        bad.push(f.name+' — '+(err instanceof SyntaxError?'not valid JSON ('+err.message.slice(0,60)+')':err.message));
      }
    }
    save();paintAll();
    if(bad.length)note('Could not import:<br>'+bad.map(esc).join('<br>'),true);
    else if(ok.length)note('Imported '+ok.map(esc).join(', ')+'.');
    else note('No files were selected.',true);
  };
  i.click();
}
$('importChars').onclick=pickFiles;
$('pasteChars').onclick=()=>{$('pasteMsg').innerHTML='';$('paste').showModal();$('pasteBox').focus();};
$('closePaste').onclick=()=>$('paste').close();

/** Splits a blob of concatenated top-level JSON objects into separate strings. */
function splitJSON(text){
  const out=[];let depth=0,start=-1,inStr=false,esc2=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(inStr){ if(esc2)esc2=false; else if(ch==='\\')esc2=true; else if(ch==='"')inStr=false; continue; }
    if(ch==='"'){inStr=true;continue;}
    if(ch==='{'){ if(!depth)start=i; depth++; }
    else if(ch==='}'){ depth--; if(!depth&&start>=0){out.push(text.slice(start,i+1));start=-1;} }
  }
  return out;
}

$('pasteGo').onclick=()=>{
  // Normalise before splitting — the splitter tracks string boundaries with " characters,
  // so curly quotes from Word or Notepad have to go first or block detection derails.
  const raw=$('pasteBox').value
    .replace(/^\uFEFF/,'')
    .replace(/[\u2018\u2019]/g,"'")
    .replace(/[\u201C\u201D]/g,'"')
    .replace(/,(\s*[}\]])/g,'$1')
    .trim();
  if(!raw)return $('pasteMsg').innerHTML='<div class="alarm">Nothing pasted.</div>';
  const blocks=splitJSON(raw);
  if(!blocks.length)return $('pasteMsg').innerHTML='<div class="alarm">No JSON object found. '+
    'Make sure you copied the whole file including the opening and closing braces.</div>';
  const ok=[],bad=[];
  blocks.forEach((b,i)=>{
    try{
      const d=JSON.parse(b);
      if(d.format==='scenewright.project'){P=d.project;ok.push('project file');return;}
      if(isLocationPackage(d)){const r=importLocations(d);
        ok.push(r.count+' locations, '+r.rooms+' rooms');return;}
      if(!d.id&&!d.display_name){bad.push('block '+(i+1)+' has no id or display_name');return;}
      ok.push(importSheet(d)+authoredNote(d));
    }catch(err){bad.push('block '+(i+1)+' — '+err.message.slice(0,70));}
  });
  save();paintAll();
  if(ok.length){$('paste').close();$('pasteBox').value='';
    note('Imported '+ok.map(esc).join(', ')+'.'+(bad.length?' Skipped '+bad.length+'.':''));}
  else $('pasteMsg').innerHTML='<div class="alarm">'+bad.map(esc).join('<br>')+'</div>';
};

document.addEventListener('dragover',e=>e.preventDefault());
document.addEventListener('drop',async e=>{
  e.preventDefault();
  const files=[...(e.dataTransfer?.files||[])];
  if(!files.length)return note('Nothing was dropped. Drag the file itself, not a shortcut.',true);
  const ok=[],bad=[];
  for(const f of files){
    try{
      const d=JSON.parse(await f.text());
      if(d.format==='scenewright.project'){P=d.project;ok.push(f.name+' (project)');continue;}
      if(isLocationPackage(d)){const r=importLocations(d);
        ok.push(f.name+' — '+r.count+' locations, '+r.rooms+' rooms'+
          (r.moved?', '+r.moved+' scenes remapped':''));
        continue;}
      if(!d.id&&!d.display_name){bad.push(f.name+' — no id or display_name');continue;}
      ok.push(importSheet(d)+authoredNote(d));
    }catch(err){
      bad.push(f.name+' — '+(err instanceof SyntaxError?'not valid JSON':err.message));
    }
  }
  save();paintAll();
  if(bad.length)note('Could not import:<br>'+bad.map(esc).join('<br>'),true);
  else note('Imported '+ok.map(esc).join(', ')+'.');
});

$('saveProj').onclick=()=>{
  const url=URL.createObjectURL(new Blob([JSON.stringify({format:'scenewright.project',project:P},null,2)],
    {type:'application/json'}));
  Object.assign(document.createElement('a'),{href:url,download:'scenewright-project.json'}).click();
  URL.revokeObjectURL(url)};
$('loadProj').onclick=pickFiles;

$('exportSheets').onclick=()=>{
  if(!P.characters.length)return raise('No characters to export.');
  P.characters.forEach((c,i)=>setTimeout(()=>{
    const url=URL.createObjectURL(new Blob([JSON.stringify(sheetOut(c),null,2)],{type:'application/json'}));
    Object.assign(document.createElement('a'),{href:url,download:c.id+'.character'}).click();
    URL.revokeObjectURL(url);
  },i*250));
};

$('addPlace').onclick=()=>{P.locations.push({id:'place_'+(P.locations.length+1),name:'New location',
  district:'',background:'',rooms:[],residents:[],services:[],tags:['custom'],notes:''});
  selPlace=P.locations.length-1;save();paintAll()};
