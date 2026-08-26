/** Every generation call goes through here, whichever engine is selected. */
async function askModel(prompt,signal,json){
  return chatComplete(prompt,signal,json);
}

/** Writes the next beat inside one branch. The model sees every line leading here,
    including which option the player picked, so the continuation actually follows on. */
async function continueBranch(path,signal,extra){
  const c=cur();if(!c)return 0;
  const opt=optAt(path);
  const saved=focusPath;
  focusPath=path;                       // historyBrief() reads the focused path
  const n=Math.max(4,Math.min(6,+$('burst').value||4));
  const prompt='You write dialogue for a visual novel. Stay strictly in character.\n\n'+
    '# Characters\n'+(presentNPCs().map(charBrief).join('\n\n')||'(none marked present)')+
    playerRule()+'\n\n'+sceneBrief()+boundsBrief()+adultBrief()+
    '\n\n# The scene so far\n'+historyBrief()+
    '\n\n# Turn order\n'+turnInstruction()+avoidRepeatBrief()+
    '\n\n# Task\n'+(playerChar()?playerChar().name:'The player')+
    ' just chose: "'+String(opt.text||'').trim()+'"'+
    (opt.flag?' (which shifts '+opt.flag+')':'')+
    '.\n\nWrite the NEXT '+n+' NEW lines along this branch. Answer the choice '+
    'directly and stay committed to what the player just said. This branch must not read like '+
    'the other options. Keep the conversation going; do NOT force a neat ending unless the '+
    'choice itself clearly ends the interaction. Do not repeat earlier lines. Respect turn order.'+
    (extra?'\n\n'+extra:'')+
    '\n\nReply with ONLY this JSON object: {"lines":[{"speaker":"character_id","text":"...",'+
    '"emotion":"..."}]}. '+
    'speaker must be one of: '+speakableIds(c).join(', ')+
    ', or "__narrator__" for narration. '+
    'Wrap physical action in *asterisks* inside text. No prose, no fences.';

  try{
    let payload=await askModel(prompt,signal,true);
    let out;
    try{ out=harvest(payload); }
    catch(e){
      payload=await askModel(prompt+'\n\nIMPORTANT: reply with the JSON array only.',signal,true);
      out=harvest(payload);
    }
    const fresh=takeFreshLines(coerceArray(out),c);
    fresh.lines.forEach(n=>opt.nodes.push(n));
    if(fresh.droppedSpeaker)note(fresh.droppedSpeaker===1
      ? 'One line written for the player was dropped — the player only speaks through choices.'
      : fresh.droppedSpeaker+' lines written for the player were dropped — the player only speaks through choices.',
      true);
    if(fresh.droppedEcho&&!fresh.lines.length)
      note('The model repeated earlier lines — those were skipped. Try Continue chat again.',true);
    return fresh.lines.length;
  }finally{ focusPath=saved; }
}

/** Every choice option in the current content that has nothing after it. */
function emptyBranches(){
  const out=[];
  const walk=(list,base)=>list.forEach((n,i)=>{
    if(n.type!=='choice')return;
    n.options.forEach((o,j)=>{
      const p=base.concat(i,j);
      if(!(o.nodes||[]).length)out.push(p);
      else walk(o.nodes,p);
    });
  });
  walk(rootList(),[]);
  return out;
}

async function fillEmpty(){
  if(busy)return;
  const paths=emptyBranches();
  if(!paths.length)return note('Every branch already continues somewhere.');
  busy=true;$('go').disabled=true;$('stop').disabled=false;abort=new AbortController();
  let done=0;
  try{
    for(const p of paths){
      note('Continuing branch '+(done+1)+' of '+paths.length+'…');
      const n=await continueBranch(p,abort.signal);
      if(n)done++;
      save();paintBody();
    }
    note(done?'Continued '+done+' branch'+(done===1?'':'es')+'.':'Nothing came back.',!done);
  }catch(e){
    if(e.name!=='AbortError')
      note('Stopped after '+done+' of '+paths.length+': '+esc(e.message),true);
  }finally{busy=false;$('go').disabled=false;$('stop').disabled=true;abort=null;paintBody();}
}

async function run(){
  if(busy)return;
  const input=$('line').value.trim();

  // Whole-scene mode can start from nothing — it makes the content item itself.
  if(mode==='scene'&&!cur()){
    if(!input)return note('Describe the scene first.',true);
    if(!P.characters.length)return note('Import a character sheet first.',true);
    const uid='u'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);
    P.content.push({uid,type:'conversation',id:'scene_'+(P.content.length+1),title:'New scene',
      location:P.locations[0]?.id||'',day:'monday',block:'evening',chapter:1,
      cast:[],requires:[],nodes:[]});
    sel=uid;focusPath=[];stageIx=0;paintAll();
  }

  const c=cur();if(!c)return;
  const canRunEmpty=mode==='choice'||mode==='variants'||mode==='chat'||
    (mode==='play'&&$('writePlayer')?.checked&&(c.nodes||c.stages)&&countLines(rootList()));
  const hasPlan=mode==='scene'&&!!c.scenePlan?.outline;
  if(!input&&!canRunEmpty&&!hasPlan)return;
  if(c.type!=='repeatable'&&mode!=='scene'&&!(c.cast||[]).length)
    return raise('Mark at least one character as present, top right.');
  if(c.type==='repeatable'&&!c.character)return raise('Pick whose repeatable this is in the strip above.');

  busy=true;$('go').disabled=true;$('stop').disabled=false;abort=new AbortController();
  const meId=$('sayAs')?.value||$('playAs')?.value;
  if(mode==='play'&&input&&meId){
    const speaker=meId==='__player__'?(playerChar()?.id||'__player__'):meId;
    if(speaker==='__player__')
      note('No sheet is flagged as the player character, so that line has nowhere to go. '+
        'Flag one in Edit sheet & limits.',true);
    else listAt(focusPath).push({type:'line',speaker,text:input,emotion:''});
  }
  $('line').value='';$('line').style.height='auto';paintBody();

  try{
    const prompt=buildPrompt(input);
    const wantsJSON=mode!=='scene';
    let payload=await askModel(prompt,abort.signal,wantsJSON);

    if(mode!=='scene'){
      // If it still isn't parseable, ask once more with the shape restated. Cheap and
      // it fixes most of the cases where a model wandered off format.
      try{ harvest(payload); }
      catch(e){
        note('First reply was malformed — asking again…');
        payload=await askModel(prompt+
          '\n\nIMPORTANT: your previous answer was not valid JSON. Reply with the single JSON '+
          'object only. No commentary, no markdown fences, no trailing commas. Close every bracket.',
          abort.signal,true);
      }
    }

    if(mode==='scene'){
      const d=parseRoleplayScene(payload,c);
      const ids=P.characters.map(x=>x.id);
      const nodes=buildScene(coerceArray(d.nodes||d.scene||d),ids,0);
      if(!nodes.length)throw new Error('the reply parsed but held no lines — '+
        'it was probably cut short. Raise the memory window in the Direction tab.');

      // Take whatever the model worked out about the setting, if it is real.
      if(d.title)c.title=String(d.title).slice(0,60);
      if(!c.id||/^scene_\d+$/.test(c.id))c.id=slug(d.title||c.title||c.id);
      if(d.location&&loc(d.location))c.location=d.location;
      if(d.block&&BLOCKS.includes(d.block))c.block=d.block;
      const found=[...new Set(nodes.flatMap(function pick(n){
        return n.type==='line'?[n.speaker]
          :n.options.flatMap(o=>o.nodes.flatMap(pick));
      }))].filter(x=>x&&x!=='__narrator__'&&ids.includes(x));
      c.cast=[...new Set((c.cast||[]).concat(Array.isArray(d.cast)
        ? d.cast.filter(x=>ids.includes(x)) : [],found))];

      // Writing into a focused branch extends that path instead of the root.
      const target=focusPath.length?listAt(focusPath):(c.nodes=c.nodes||[]);
      nodes.forEach(n=>target.push(n));
      clearAlarm();save();paintAll();
      $('tree').scrollTop=$('tree').scrollHeight;
      note('Wrote "'+esc(c.title)+'" — '+countLines(nodes)+' lines, '+
        routes(nodes,[]).length+' routes.');
      busy=false;$('go').disabled=false;$('stop').disabled=true;abort=null;
      if(emptyBranches().length)await fillEmpty();
      return;
    }

    const out=harvest(payload);

    const rows=coerceArray(out);
    if(mode==='variants'){
      c.lines=c.lines||[];
      rows.forEach(l=>{const t=typeof l==='string'?l:l?.text;if(!t)return;
        c.lines.push({text:String(t).trim(),emotion:(l.emotion||'').toString().toLowerCase().slice(0,18),
          min_chapter:+c.chapter||0});});
    }else if(mode==='choice'){
      listAt(focusPath).push({type:'choice',options:rows.slice(0,4).map(o=>
        ({text:typeof o==='string'?o:(o.text||String(o)),flag:'',nodes:[]}))});
    }else{
      let fresh=takeFreshLines(rows,c);
      fresh.lines.forEach(n=>listAt(focusPath).push(n));
      // Second short wave if the writer asked for a long stretch and the first batch was clean.
      const want=Math.max(4,Math.min(10,+$('burst').value||4));
      if(mode==='chat'&&fresh.lines.length>=3&&fresh.lines.length<want&&abort&&!abort.signal.aborted){
        note('Continuing without repeats…');
        const morePrompt=buildPrompt(input);
        let more=await askModel(morePrompt,abort.signal,true);
        try{ harvest(more); }catch(e){ more=await askModel(morePrompt+
          '\n\nIMPORTANT: reply with the single JSON object only.',abort.signal,true); }
        const wave=takeFreshLines(coerceArray(harvest(more)),c);
        wave.lines.forEach(n=>listAt(focusPath).push(n));
        fresh={lines:fresh.lines.concat(wave.lines),
          droppedEcho:fresh.droppedEcho+wave.droppedEcho,
          droppedSpeaker:fresh.droppedSpeaker+wave.droppedSpeaker};
      }
      if(fresh.droppedSpeaker)note(fresh.droppedSpeaker===1
        ? 'One line written for the player was dropped — the player only speaks through choices.'
        : fresh.droppedSpeaker+' lines written for the player were dropped — the player only speaks through choices.',
        true);
      else if(fresh.droppedEcho&&!fresh.lines.length)
        note('Those lines were repeats of earlier dialogue, so they were skipped. Add a line yourself or try again with a direction.',true);
      else if(fresh.droppedEcho)
        note('Skipped '+fresh.droppedEcho+' repeated line'+(fresh.droppedEcho===1?'':'s')+'.',false);
    }
    clearAlarm();save();paintBody();$('tree').scrollTop=$('tree').scrollHeight;
  }catch(e){
    if(e.name==='AbortError'){}
    else if(e instanceof SyntaxError){
      const raw=(e.raw||'').trim();
      raise('The model\'s reply couldn\'t be parsed even after a retry.'+
        (raw?'<br><br>It sent this:<br><code style="display:block;white-space:pre-wrap;'+
          'max-height:110px;overflow:auto;margin-top:5px">'+esc(raw.slice(0,400))+
          (raw.length>400?'\n…':'')+'</code>':'')+
        '<br>If that looks like prose rather than JSON, the model is ignoring the format. '+
        'Try temperature 0.6, or a larger model.'+
        (raw&&!raw.trim().endsWith('}')&&!raw.trim().endsWith(']')
          ? '<br><b>It looks cut off</b> — raise the memory window in the Direction tab.':''));
    }
    else raise('Generation failed: '+esc(e.message));
  }finally{busy=false;$('go').disabled=false;$('stop').disabled=true;abort=null;}
}
