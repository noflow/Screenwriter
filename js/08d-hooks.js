/* ---- draft a quest from a hook ---- */
function openHooks(){
  const c=P.characters[selChar];if(!c)return;
  const written=new Set(P.content.filter(x=>x.type==='quest').map(x=>x.id));
  const hooks=(c.quest_hooks||[]).filter(hk=>!written.has(hk));
  if(!hooks.length)return note('Every hook on this sheet already has a quest.');
  note('Drafting '+hooks[0]+'…');
  draftHook(c,hooks[0]);
}

/** Uses the character's own written quests as the style reference. */
function houseStyle(c){
  const example=P.content.find(x=>x.type==='quest'&&x.character===c.id&&(x.stages||[]).length>1);
  if(!example)return '';
  return '\n\nAn existing quest for this character, as a style reference:\n'+
    JSON.stringify({title:example.title,summary:example.hook,
      objectives:(example.stages||[]).filter(s=>s.id!=='branch').map(s=>({id:s.id,text:s.title}))},null,1);
}

async function draftHook(c,hook){
  if(busy)return;
  busy=true;$('go').disabled=true;
  const prompt='You design quests for a life-sim visual novel.\n\n# Character\n'+charBrief(c)+
    '\n\n# Their schedule\n'+
    (c.schedule?.fixed_commitments||[]).map(f=>pretty(f.activity)+': '+
      (f.days||[]).join('/')+' '+(f.blocks||[]).join('/')).join('\n')+
    '\n\n# Locations available\n'+P.locations.map(l=>l.id+' — '+l.name).join('\n')+
    houseStyle(c)+
    '\n\n# Task\nDesign the quest for the hook "'+hook+'". Give it 2 to 4 objectives that happen '+
    'in a sensible order, each a concrete thing the player does. If the hook implies a real decision, '+
    'add 2 or 3 branches. Ground it in this character\'s actual schedule and locations.\n\n'+
    'Reply with ONLY this JSON shape, no prose or fences:\n'+
    '{"title":"...","summary":"...","location":"<a location id from the list>",'+
    '"block":"morning|lunch|afternoon|evening|late_evening|night",'+
    '"objectives":[{"id":"snake_case","text":"What the player does."}],'+
    '"branches":[{"id":"snake_case","summary":"..."}]}';

  try{
    const r=await fetch(HOST+'/api/chat',{method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({model:$('model').value,stream:false,
        messages:[{role:'user',content:prompt}],
        options:{temperature:0.7,num_ctx:parseInt($('ctx').value,10)}})});
    if(!r.ok)throw new Error('Ollama returned '+r.status);
    let t=(await r.json()).message?.content||'';
    t=t.trim().replace(/^```(?:json)?/i,'').replace(/```$/,'').trim();
    const a=t.indexOf('{'),b=t.lastIndexOf('}');
    const d=JSON.parse(a>=0?t.slice(a,b+1):t);

    const stages=coerceArray(d.objectives).slice(0,5).map((o,i)=>({
      id:slug(o.id||'obj_'+(i+1)),title:o.text||'Objective '+(i+1),
      location:loc(d.location)?d.location:(P.locations[0]?.id||''),
      nodes:[],flag:'',requires:[],
      completion:{event:'conversation_completed',conversation:''}
    }));
    const brs=coerceArray(d.branches);
    if(brs.length>1)stages.push({id:'branch',title:'Branch — outcome',
      location:loc(d.location)?d.location:'',requires:[],flag:'',
      nodes:[{type:'choice',options:brs.slice(0,4).map(b=>({
        text:b.summary||pretty(b.id),flag:slug(b.id),requires:[],nodes:[]}))}]});

    const uid='q_'+hook;
    const item={uid,type:'quest',id:hook,title:d.title||pretty(hook),
      character:c.id,cast:[c.id],hook:d.summary||'',premise:d.summary||'',
      location:loc(d.location)?d.location:(P.locations[0]?.id||''),
      day:'monday',block:d.block||'evening',chapter:1,requires:[],after:'',
      stages:stages.length?stages:[{id:'stage_1',title:'Opening',location:'',nodes:[],
        flag:'quest_'+hook+'_done',requires:[]}]};
    const last=item.stages[item.stages.length-1];
    last.flag=('quest_'+hook+'_done'+(last.flag?'; '+last.flag:''));

    const at=P.content.findIndex(x=>x.type==='quest'&&x.id===hook);
    at>=0?P.content[at]=item:P.content.push(item);
    sel=uid;stageIx=0;focusPath=[];save();paintAll();
    note('Drafted "'+esc(item.title)+'" — '+stages.length+' objectives. Edit the completion conditions.');
  }catch(e){
    note('Couldn\'t draft that hook: '+esc(e.message)+
      (e instanceof SyntaxError?' — try a lower temperature or a larger model.':''),true);
  }finally{busy=false;$('go').disabled=false;}
}
