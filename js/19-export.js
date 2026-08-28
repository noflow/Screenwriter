/* ============ export ============ */

function toJSON(){
  const pick=t=>P.content.filter(c=>c.type===t);
  const acts=activityBlocks();
  const place=ref=>({location:locPart(ref),room:roomPart(ref)});
  return JSON.stringify({format:'scenewright.v3',
    player:{id:'player',runtime:true,source:'new_game'},
    characters:npcs().map(c=>{
      const g=gameReady(c);
      return {id:c.id,name:c.name,color:c.color,
        age:g.profile?.age??null,
        is_player:isPlayer(c),
        romance_eligible:g.profile.romance_eligible,
        family_only:!!g.boundaries.family_only,
        hard_limits:g.boundaries.hard_limits||[],
        adult_hard_limits:g.private_profile?.adult_preferences?.hard_limits||[],
        chapters:(c.relationship_chapters||[]).map(x=>({level:x.level,id:x.id,title:x.title,
          requires:x.requires||[]})),
        social_preferences:g.social_preferences||{},
        stat_caps:c.stat_caps||{},
        relationship_defaults:c.relationship_defaults||{}};
    }),
    // Rooms travel with their location: scenes are authored at "place.room" and
    // the runtime needs the room table to resolve one.
    locations:P.locations.map(l=>({id:l.id,name:l.name,background:l.background,
      district:l.district,type:l.type||'',
      rooms:(l.rooms||[]).map(r=>({id:r.id,name:r.name,access:r.access||''})),
      travel_node:l.travel_node!==false})),
    // The declared state contract — types, starting values and ceilings.
    registry:stateRegistry(),
    conversations:pick('conversation').map(c=>Object.assign({id:c.id,title:c.title},
      place(c.location),
      {day:c.day,block:c.block,cast:c.cast||[],chapter:+c.chapter||0,
       requires:c.requires||[],start:!!c.start,
       replayable:!!c.replayable,sets_flag:c.flag||'',
       days:contentDays(c),nodes:clean(c.nodes||[])})).concat(acts.conversations),
    quests:pick('quest').map(c=>({id:c.id,title:c.title,giver:c.character||'',hook:c.hook||'',
      cast:c.cast||[],requires:c.requires||[],
      stages:(c.stages||[]).map(s=>Object.assign({id:s.id,title:s.title},place(s.location),
        {sets_flag:s.flag||'',effects:compileEffects(s.flag),
         requires:s.requires||[],
         ...((s.completion||(s._authored&&s._authored.completion))
           ?{completion:s.completion||(s._authored&&s._authored.completion)}:{}),
         ...((s.hiddenUntil||(s._authored&&s._authored.hidden_until))
           ?{hidden_until:s.hiddenUntil||(s._authored&&s._authored.hidden_until)}:{}),
         nodes:clean(s.nodes||[])}))})),
    activities:acts.activities,
    text_messages:allTextMessages().map(({owner,message})=>Object.assign(
      {character:owner.id},phoneMessageOut(message))),
    repeatables:pick('repeatable').map(c=>Object.assign({id:c.id,character:c.character},
      place(c.location),
      {days:c.days||(c.day?[c.day]:[]),blocks:c.blocks||(c.block?[c.block]:[]),
       requires:c.requires||[],lines:(c.lines||[]).map(l=>
         ({text:l.text,emotion:l.emotion||'',min_chapter:+l.min_chapter||0}))}))},null,2);
}
function plain(l,pad){return l.map(n=>n.type==='line'
  ?pad+(chr(n.speaker)?.name||n.speaker).toUpperCase()+'\n'+pad+n.text
  :n.type==='jump'?pad+'→ '+(n.target||'(unset)')
  :n.options.map((o,i)=>pad+'['+(i+1)+'] '+o.text+'\n'+plain(o.nodes,pad+'    ')).join('\n')).join('\n\n');}
function phoneScript(){
  return allTextMessages().map(({owner,message})=>{
    const outgoing=textMessageDirection(message)==='outgoing';
    const trigger=Object.entries(message.trigger||{}).map(([key,value])=>
      key.replace(/_/g,' ')+' '+(Array.isArray(value)?value.join(' · '):value)).join(', ')||'manual';
    const lines=['== '+owner.name+' · '+(outgoing?'Player sends':'NPC sends')+' ('+message.id+') ==',
      'Trigger: '+trigger,'',outgoing?'PLAYER':'NPC',String(message.text||'')];
    (message.quick_replies||[]).forEach((reply,index)=>{
      lines.push('',`[${index+1}] PLAYER — ${reply.text||''}`);
      if((reply.effects||[]).length)lines.push('    Effects: '+reply.effects.map(effect=>
        effect.operation+' '+[effect.quest,effect.objective,effect.character&&effect.meter?
          effect.character+'.'+effect.meter:null,effect.key,effect.value].filter(x=>x!==undefined&&x!==null&&x!=='').join(' ')).join('; '));
    });
    return lines.join('\n');
  }).join('\n\n\n');
}
function toScript(){
  const scenes=P.content.map(c=>{
    const h='== '+(c.title||c.id)+' ('+c.type+') ==\n';
    if(c.type==='repeatable')return h+'\n'+(c.lines||[]).map(l=>'· '+l.text).join('\n');
    if(c.type==='quest')return h+'\n'+(c.stages||[]).map((s,i)=>
      '-- stage '+(i+1)+': '+s.title+' --\n'+plain(s.nodes,'')).join('\n\n');
    if(c.type==='activity')return h+'\n'+(c.stages||[]).map((s,i)=>
      '-- '+(i===0?'ordinary visit':'after '+(+s.at||1)+' successes')+': '+s.title+' --\n'+
      plain(s.nodes||[],'')).join('\n\n');
    return h+'\n'+plain(c.nodes||[],'');
  }).join('\n\n\n');
  return [phoneScript(),scenes].filter(Boolean).join('\n\n\n');
}
function toSheets(){
  if(!npcs().length)return '// No NPC characters imported. The runtime Player needs no sheet.';
  return npcs().map(c=>'// ---- '+c.id+'.character ----\n'+
    JSON.stringify(sheetOut(c),null,2)).join('\n\n');
}
const build=()=>fmt==='sheets'?toSheets():fmt==='json'?toJSON():toScript();
$('openMap').onclick=openMap;
$('openInspect').onclick=()=>openInspect();
$('openExport').onclick=()=>{
  $('dump').value=build();$('sheet').showModal();
  const g=godotCheck();
  if(g.fatal)note(g.fatal+' fatal mismatch'+(g.fatal===1?'':'es')+' between this project and the '+
    'runtime — content would load and never play. Inspect → Godot lists them.',true);
};
$('closeSheet').onclick=()=>$('sheet').close();
document.querySelectorAll('[data-fmt]').forEach(b=>b.onclick=()=>{fmt=b.dataset.fmt;
  document.querySelectorAll('[data-fmt]').forEach(x=>x.classList.toggle('on',x===b));$('dump').value=build();});
$('copyOut').onclick=()=>{navigator.clipboard.writeText($('dump').value);
  $('copyOut').textContent='Copied';setTimeout(()=>$('copyOut').textContent='Copy',1200)};
$('dlOut').onclick=()=>{
  if(fmt==='sheets'){
    npcs().forEach((c,i)=>setTimeout(()=>{
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
  if(t==='conversation'){base.nodes=[];base.days=['monday'];}
  if(t==='quest'){base.stages=[{id:'stage_1',title:'Opening',location:base.location,nodes:[],flag:''}];
    base.character=npcs()[0]?.id||'';base.hook='';}
  if(t==='repeatable'){base.lines=[];base.character=npcs()[0]?.id||'';}
  if(t==='activity'){
    base.character=npcs()[0]?.id||'';
    base.name=base.title;
    base.cast=[base.character].filter(Boolean);
    base.days=['monday'];base.incrementsOn='explicit_success';base.repeatLimit='once_per_block';
    base.stages=[{id:'base',title:'Every time',at:0,nodes:[],flag:'',requires:[],once:false}];
  }
  P.content.push(base);sel=uid;focusPath=[];stageIx=0;save();paintAll();
});

/* ============ import ============ */
function customLocationImportSummary(r){
  return r.added+' custom location'+(r.added===1?'':'s')+' added or updated'+
    (r.collisions?.length?'; skipped game-owned '+r.collisions.join(', '):'')+
    (r.duplicates?.length?'; duplicate entries resolved: '+r.duplicates.join(', '):'');
}
async function pickFiles(){
  const i=Object.assign(document.createElement('input'),{type:'file',multiple:true});
  i.onchange=async()=>{
    const ok=[],bad=[];
    for(const f of i.files){
      try{
        const txt=await f.text(),d=JSON.parse(txt);
        if(d.format==='scenewright.project'){restoreProject(d.project);ok.push(f.name+' (project)');continue;}
        if(isLocationPackage(d)){const r=importLocations(d);
          if(r.custom){ok.push(f.name+' — '+customLocationImportSummary(r));continue;}
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
      if(d.format==='scenewright.project'){restoreProject(d.project);ok.push('project file');return;}
      if(isLocationPackage(d)){const r=importLocations(d);
        if(r.custom){ok.push(customLocationImportSummary(r));return;}
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
      if(d.format==='scenewright.project'){restoreProject(d.project);ok.push(f.name+' (project)');continue;}
      if(isLocationPackage(d)){const r=importLocations(d);
        if(r.custom){ok.push(f.name+' — '+customLocationImportSummary(r));continue;}
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
  if(!npcs().length)return raise('No NPC character sheets to export. The runtime Player needs no sheet.');
  npcs().forEach((c,i)=>setTimeout(()=>{
    const url=URL.createObjectURL(new Blob([JSON.stringify(sheetOut(c),null,2)],{type:'application/json'}));
    Object.assign(document.createElement('a'),{href:url,download:c.id+'.character'}).click();
    URL.revokeObjectURL(url);
  },i*250));
};

$('addPlace').onclick=()=>{P.locations.push({id:'place_'+(P.locations.length+1),name:'New location',
  district:DISTRICTS[0]?.id||'',background:'',rooms:[],residents:[],services:[],tags:['custom'],notes:''});
  selPlace=P.locations.length-1;save();paintAll()};
