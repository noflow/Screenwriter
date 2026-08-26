/* ============ conversational quest workshop ============ */
let qwWorking=false,qwAbort=null;

function questWorkshopState(){
  if(!qbQuest)return {version:1,speaker:'guide',messages:[]};
  qbQuest.questPlan=qbQuest.questPlan||{};
  let state=qbQuest.questPlan.workshop;
  if(!state||typeof state!=='object')state={version:1,speaker:'guide',messages:[]};
  state.version=1;
  state.speaker=String(state.speaker||'guide');
  state.messages=(Array.isArray(state.messages)?state.messages:[]).map(message=>({
    role:message?.role==='assistant'?'assistant':'user',
    speaker:String(message?.speaker|| (message?.role==='assistant'?'guide':'writer')),
    text:String(message?.text??message?.content??'').trim().slice(0,4000)
  })).filter(message=>message.text).slice(-80);
  qbQuest.questPlan.workshop=state;
  return state;
}

function questWorkshopSpeakers(){
  const plan=qbQuest?.questPlan||{};
  const ids=[qbQuest?.character,...(plan.participants||[])].filter(Boolean);
  const characters=[...new Set(ids)].map(chr).filter(c=>c&&!isPlayer(c));
  return [{id:'guide',name:'Story Guide',color:'#D7B46F',guide:true},...characters];
}

function questWorkshopSpeaker(id){
  return questWorkshopSpeakers().find(s=>s.id===id)||questWorkshopSpeakers()[0];
}

function questWorkshopCharacterBrief(c){
  const profile=c.profile||{},personality=c.personality||{},style=c.text_style||{},bits=[];
  bits.push('## '+c.name+' (id: '+c.id+')');
  if(profile.age||profile.occupation||profile.role)
    bits.push('Role: '+[profile.age,pretty(profile.occupation||profile.role||'')].filter(Boolean).join(', '));
  if(personality.traits?.length)bits.push('Traits: '+personality.traits.map(pretty).join(', '));
  if(personality.values?.length)bits.push('Values: '+personality.values.map(pretty).join(', '));
  if(personality.social_style)bits.push('Social style: '+pretty(personality.social_style));
  if(style.tone)bits.push('Speech: '+pretty(style.tone));
  if(c.goals?.length)bits.push('Wants: '+c.goals.map(pretty).join('; '));
  const limits=[...(c.boundaries?.hard_limits||[])];
  if(c.profile?.romance_eligible===false)bits.push('Hard rule: this character is not a romance option.');
  if(c.boundaries?.family_only)bits.push('Hard rule: family warmth is never romantic.');
  if(limits.length)bits.push('Hard limits: '+limits.map(pretty).join(', '));
  return bits.join('\n');
}

function questWorkshopContext(){
  const c=qbQuest,plan=c?.questPlan||{},event=plan.eventDraft||plan.event||{};
  const giver=chr(c?.character),participants=(plan.participants||[]).map(chr).filter(Boolean);
  const objectiveText=questObjectiveEntries(c).map((entry,i)=>(i+1)+'. '+(entry.stage.title||'Untitled objective')).join('\n');
  return [
    'Title: '+(c?.title||'New quest'),
    'Category: '+pretty(plan.category||'character_story'),
    'Quest giver: '+(giver?giver.name+' ('+giver.id+')':'not chosen'),
    'Other NPCs: '+(participants.length?participants.map(x=>x.name+' ('+x.id+')').join(', '):'none chosen'),
    'Primary location: '+(c?.location?placeName(c.location)+' ('+c.location+')':'not chosen'),
    'Summary: '+(plan.summary||c?.hook||c?.premise||'not written yet'),
    'Objectives:\n'+(objectiveText||'none yet'),
    'Completion rewards: '+(plan.rewards||'none yet'),
    'Branch notes: '+(plan.branchIdeas||'none yet'),
    'Deadline: '+(plan.deadline||'none'),
    'Follow-up event: '+([event.title,event.date,event.block,event.location].filter(Boolean).join(' | ')||'none')
  ].join('\n');
}

function questWorkshopTranscript(messages){
  return (messages||[]).slice(-18).map(message=>{
    const who=message.role==='user'?'Writer':questWorkshopSpeaker(message.speaker).name;
    return '['+who+']\n'+message.text.slice(0,1800);
  }).join('\n\n');
}

function questWorkshopReplyPrompt(state,speaker){
  const roster=questWorkshopSpeakers().filter(x=>!x.guide).map(x=>questWorkshopCharacterBrief(chr(x.id))).join('\n\n');
  const replyRule=speaker.guide
    ? 'Reply as the Story Guide: a warm, practical collaborator helping the writer shape a playable quest. Ask no more than one focused question at a time. When useful, offer a few concise choices.'
    : 'Reply only as '+speaker.name+' in a natural roleplay exchange. Use their voice, first-person dialogue, and brief actions. Reveal what they want, what they are reluctant to say, or what could complicate the request. Never write the Player\'s dialogue, thoughts, identity, or decision.';
  return 'You are part of a conversational quest workshop for a life-sim roleplaying game.\n'+
    'The Player is the real person using the game and is created fresh for every save. Never assign the Player a fixed name, age, gender, appearance, personality, thoughts, or choice. Do not ask the writer to define a fixed Player identity as a prerequisite; make the quest work with the identity created at runtime unless the writer explicitly chooses an identity-based condition.\n'+
    'Keep all suggestions grounded in the supplied characters and locations. Do not invent a new named NPC unless the writer explicitly asks for one. Respect every hard rule.\n'+
    'Follow the writer\'s latest request directly. If they ask for ideas, alternatives, or a specific number of hooks, provide those before asking any follow-up question.\n'+
    'Speak in ordinary conversational text. Do not output JSON, schemas, code fences, or technical implementation details. Keep the reply focused and under 350 words.\n\n'+
    '# Current editable quest\n'+questWorkshopContext()+'\n\n'+
    '# Available NPC sheets\n'+(roster||'No NPC has been selected yet.')+'\n\n'+
    '# Workshop conversation\n'+(questWorkshopTranscript(state.messages)||'[No messages yet]')+'\n\n'+
    '# Next reply\n'+replyRule;
}

function questWorkshopMessageHtml(message,index){
  const speaker=message.role==='user'?{name:'Writer',color:'#8DB9DA'}:questWorkshopSpeaker(message.speaker);
  const initials=message.role==='user'?'YOU':speaker.guide?'✦':speaker.name.split(/\s+/).slice(0,2).map(x=>x[0]).join('').toUpperCase();
  const color=/^#[0-9a-f]{3,8}$/i.test(speaker.color||'')?speaker.color:'#98BDA8';
  return '<article class="qw-message '+(message.role==='user'?'user':'assistant')+'" style="--qw-speaker:'+color+'">'+
    '<div class="qw-avatar">'+esc(initials)+'</div><div class="qw-bubble">'+
    '<div class="qw-message-meta"><strong>'+esc(speaker.name)+'</strong><button type="button" data-qw-remove="'+index+'" aria-label="Remove message">remove</button></div>'+
    '<div class="qw-message-text">'+esc(message.text).replace(/\n/g,'<br>')+'</div></div></article>';
}

function paintQuestWorkshop(){
  const state=questWorkshopState(),speakers=questWorkshopSpeakers();
  if(!speakers.some(x=>x.id===state.speaker))state.speaker='guide';
  $('qwQuestName').textContent=qbQuest?.title||'New quest';
  const npcNames=speakers.filter(x=>!x.guide).map(x=>x.name);
  $('qwCastSummary').textContent=npcNames.length?'Talking with '+npcNames.join(', ')+'.':'Choose a giver or participant to add an in-character voice.';
  $('qwSpeaker').innerHTML=speakers.map(s=>'<option value="'+esc(s.id)+'"'+(s.id===state.speaker?' selected':'')+'>'+esc(s.name)+(s.guide?' — planning':' — in character')+'</option>').join('');
  const box=$('qwMessages');
  box.innerHTML=state.messages.length?state.messages.map(questWorkshopMessageHtml).join(''):
    '<div class="qw-empty"><span>✦</span><h4>Build the quest by talking it out</h4><p>Describe a rough idea, ask for hooks, or select a quest giver and speak with them in character. Nothing here needs special formatting.</p></div>';
  box.querySelectorAll('[data-qw-remove]').forEach(button=>button.onclick=()=>{
    state.messages.splice(+button.dataset.qwRemove,1);save();paintQuestWorkshop();
  });
  $('qwRegenerate').disabled=qwWorking||!state.messages.some(x=>x.role==='user');
  $('qwBuild').disabled=qwWorking||!state.messages.length;
  $('qwClear').disabled=qwWorking||!state.messages.length;
  requestAnimationFrame(()=>{box.scrollTop=box.scrollHeight;});
}

function setQuestWorkshopBusy(on,status){
  qwWorking=on;
  ['qwSend','qwRegenerate','qwBuild','qwSpeaker','qwClear'].forEach(id=>$(id).disabled=on);
  $('qwStop').disabled=!on;
  $('qwSend').textContent=on?'Thinking…':'Send';
  $('qwStatus').textContent=status||(on?'Writing a reply…':'Enter sends · Shift+Enter adds a line');
}

function openQuestWorkshop(){
  if(!qbQuest)return;
  updateQuestFromBuilder();save();
  $('questBuilder').close();
  const local=typeof isLocalEngine==='function'&&isLocalEngine();
  $('qwPrivacy').textContent=local?'Using the selected local AI engine; the conversation stays on this computer.':
    'Using the selected remote AI engine; workshop text and the selected NPC details are sent to that provider.';
  setQuestWorkshopBusy(false);
  paintQuestWorkshop();
  $('questWorkshop').showModal();
  $('qwInput').focus();
}

function returnFromQuestWorkshop(){
  if(qwAbort)qwAbort.abort();
  if($('questWorkshop').open)$('questWorkshop').close();
  if(qbQuest)openQuestBuilder();
}

async function generateQuestWorkshopReply(speakerId){
  const state=questWorkshopState(),speaker=questWorkshopSpeaker(speakerId||state.speaker);
  state.speaker=speaker.id;save();paintQuestWorkshop();
  qwAbort=new AbortController();setQuestWorkshopBusy(true,speaker.guide?'Story Guide is thinking…':speaker.name+' is replying…');
  let finalStatus='Enter sends · Shift+Enter adds a line';
  try{
    const reply=String(await askModel(questWorkshopReplyPrompt(state,speaker),qwAbort.signal,false)||'').trim();
    if(!reply)throw new Error('The AI returned an empty reply.');
    state.messages.push({role:'assistant',speaker:speaker.id,text:reply.slice(0,4000)});
    state.messages=state.messages.slice(-80);save();paintQuestWorkshop();
  }catch(error){
    if(error.name==='AbortError')finalStatus='Reply stopped. You can edit your message and try again.';
    else finalStatus='Could not get a reply: '+error.message;
  }finally{
    qwAbort=null;setQuestWorkshopBusy(false,finalStatus);paintQuestWorkshop();
  }
}

async function sendQuestWorkshopMessage(){
  if(qwWorking)return;
  const text=$('qwInput').value.trim();if(!text)return;
  const state=questWorkshopState();
  state.speaker=$('qwSpeaker').value||'guide';
  state.messages.push({role:'user',speaker:'writer',text:text.slice(0,4000)});
  state.messages=state.messages.slice(-80);$('qwInput').value='';save();paintQuestWorkshop();
  await generateQuestWorkshopReply(state.speaker);
}

function regenerateQuestWorkshopReply(){
  if(qwWorking)return;
  const state=questWorkshopState();
  let index=-1;
  for(let i=state.messages.length-1;i>=0;i--)if(state.messages[i].role==='assistant'){index=i;break;}
  const removed=index>=0?state.messages.splice(index,1)[0]:null;
  if(!state.messages.some(x=>x.role==='user'))return paintQuestWorkshop();
  if(removed?.speaker)state.speaker=removed.speaker;
  save();paintQuestWorkshop();generateQuestWorkshopReply(state.speaker);
}

function questWorkshopHeaderKey(label){
  const key=slug(String(label||'').replace(/\*/g,''));
  const aliases={
    title:'title',quest_title:'title',summary:'summary',hook:'summary',premise:'summary',
    category:'category',story_type:'category',giver:'giver',quest_giver:'giver',
    cast:'cast',participants:'cast',characters:'cast',setting:'setting',primary_location:'setting',
    objectives:'objectives',objective:'objectives',stages:'objectives',steps:'objectives',
    rewards:'rewards',completion_rewards:'rewards',consequences:'rewards',
    branches:'branches',branch_ideas:'branches',stat_branches:'branches',outcomes:'branches',
    deadline:'deadline',story_deadline:'deadline',follow_up:'followup',follow_up_event:'followup',completion_event:'followup',
    event_title:'event_title',game_date:'date',date:'date',time:'block',time_block:'block',block:'block',location:'location'
  };
  return aliases[key]||'';
}

function questWorkshopCleanItem(text){
  return String(text||'').trim().replace(/^[-*•]\s*/,'').replace(/^\d+[.)]\s*/, '').trim();
}

/** Tolerant plain-text worksheet parser. It never expects or accepts AI-authored JSON. */
function parseQuestWorkshopDraft(raw){
  const out={title:'',summary:'',category:'',giver:'',cast:[],location:'',deadline:'',
    objectives:[],rewards:[],branches:[],event:{title:'',date:'',block:'',location:'',clear:false},seen:{},raw:String(raw||'')};
  const summary=[],lines=String(raw||'').replace(/```[^\n]*\n?/g,'').replace(/```/g,'').split(/\r?\n/);
  let section='',inFollowup=false,recognized=0;
  const setHeader=(key,value)=>{
    recognized++;out.seen[key]=true;value=questWorkshopCleanItem(value);
    if(key==='followup'){
      section='followup';inFollowup=true;
      if(/^(?:none|no event|n\/a)$/i.test(value))out.event.clear=true;
      else if(value)out.event.title=value;
      return;
    }
    if(key==='title'){
      if(inFollowup){out.event.title=value;out.seen.event_title=true;}
      else out.title=value;
      section='';return;
    }
    if(key==='summary'){section='summary';if(value)summary.push(value);return;}
    if(key==='objectives'||key==='rewards'||key==='branches'){
      section=key;if(value)out[key].push(value);return;
    }
    if(key==='category'||key==='giver'||key==='deadline')out[key]=value;
    else if(key==='cast')out.cast=value?value.split(/\s*(?:,|;|\band\b)\s*/i).filter(Boolean):[];
    else if(key==='setting')out.location=value;
    else if(key==='event_title')out.event.title=value;
    else if(key==='date')out.event.date=value;
    else if(key==='block')out.event.block=value;
    else if(key==='location'){
      if(inFollowup)out.event.location=value;else out.location=value;
    }
    if(!['event_title','date','block','location'].includes(key))section='';
  };
  lines.forEach(rawLine=>{
    const line=String(rawLine).trim().replace(/^#{1,6}\s*/,'').replace(/\*\*/g,'');
    if(!line)return;
    const divided=line.match(/^([^:|]{2,42})\s*[:|]\s*(.*)$/)||line.match(/^([A-Za-z][A-Za-z /_-]{1,40})\s+-\s+(.+)$/);
    const exact=questWorkshopHeaderKey(line);
    const key=divided?questWorkshopHeaderKey(divided[1]):exact;
    if(key){setHeader(key,divided?divided[2]:'');return;}
    const item=questWorkshopCleanItem(line);if(!item)return;
    if(section==='summary')summary.push(item);
    else if(section==='objectives'||section==='rewards'||section==='branches')out[section].push(item);
  });
  out.summary=summary.join(' ').trim();
  out.objectives=[...new Set(out.objectives.filter(Boolean))];
  out.rewards=[...new Set(out.rewards.filter(Boolean))];
  out.branches=[...new Set(out.branches.filter(Boolean))];
  if(!recognized){
    const bullets=lines.map(questWorkshopCleanItem).filter((line,i)=>/^\s*(?:[-*•]|\d+[.)])\s+/.test(lines[i])&&line);
    if(bullets.length)out.objectives=[...new Set(bullets)];
    out.summary=lines.map(x=>x.trim()).filter(Boolean).join(' ').slice(0,900);
  }
  return out;
}

function questWorkshopCharacterAliases(){
  const characters=P.characters.filter(c=>!isPlayer(c)),firstCounts={};
  characters.forEach(c=>{const first=slug(c.name).split('_')[0];firstCounts[first]=(firstCounts[first]||0)+1;});
  const aliases=[{id:'player',alias:'player'},{id:'player',alias:'user'}];
  characters.forEach(c=>{
    const values=[c.id,c.name,slug(c.name)],first=slug(c.name).split('_')[0];
    if(firstCounts[first]===1)values.push(first);
    [...new Set(values.map(slug))].forEach(alias=>aliases.push({id:c.id,alias}));
  });
  return aliases.sort((a,b)=>b.alias.length-a.alias.length);
}

function resolveQuestWorkshopCharacter(value,allowPlayer=false){
  const normalized=slug(String(value||'').replace(/\([^)]*\)/g,''));
  if(!normalized||['none','no_specific_giver','not_chosen','n_a'].includes(normalized))return '';
  const matches=[...new Set(questWorkshopCharacterAliases().filter(x=>x.alias===normalized).map(x=>x.id))];
  if(matches.length!==1||(!allowPlayer&&matches[0]==='player'))return null;
  return matches[0];
}

function resolveQuestWorkshopLocation(value){
  const normalized=slug(String(value||'').replace(/\([^)]*\)/g,''));
  if(!normalized||['none','not_chosen','n_a'].includes(normalized))return '';
  const candidates=[];
  P.locations.forEach(place=>{
    [place.id,place.name].forEach(alias=>candidates.push({ref:place.id,alias:slug(alias)}));
    (place.rooms||[]).forEach(room=>{
      const ref=place.id+'.'+room.id;
      [ref,room.id,room.name,place.name+' '+room.name].forEach(alias=>candidates.push({ref,alias:slug(alias)}));
    });
  });
  const matches=[...new Set(candidates.filter(x=>x.alias===normalized).map(x=>x.ref))];
  return matches.length===1?matches[0]:null;
}

function parseQuestWorkshopReward(text){
  const source=questWorkshopCleanItem(text).replace(/^(?:reward|consequence)\s*[:|-]\s*/i,'');
  const amountMatch=source.match(/([+-]?\d+)\s*$/);if(!amountMatch)return null;
  const amount=+amountMatch[1];if(!amount||Math.abs(amount)>5)return null;
  const subject=slug(source.slice(0,amountMatch.index));
  const alias=questWorkshopCharacterAliases().find(x=>subject===x.alias||subject.startsWith(x.alias+'_'));
  if(!alias)return null;
  let metric=subject.slice(alias.alias.length).replace(/^_+|_+$/g,'')
    .replace(/^(?:gains?|loses?|gets?|relationship|meter|stat|custom|attribute|attributes|need|needs)_+/,'');
  metric=metric.replace(/_(?:gains?|loses?|change)$/,'');
  if(alias.id==='player'){
    const found=QB_PLAYER_REWARDS.find(([id,label])=>{
      const key=id.split(':')[1];return [slug(id),slug(label),slug(key)].includes(metric);
    });
    return found?{character:'player',reward:found[0],value:amount}:null;
  }
  const relationship=QB_RELATIONSHIP_REWARDS.find(([key,label])=>[slug(key),slug(label)].includes(metric));
  if(relationship)return {character:alias.id,reward:'relationship:'+relationship[0],value:amount};
  const custom=customStatDefs().find(stat=>[slug(stat.id),slug(stat.label)].includes(metric));
  return custom?{character:alias.id,reward:'custom:'+custom.id,value:amount}:null;
}

function questWorkshopCategory(value){
  const key=slug(value),allowed=['character_story','relationship','work','school','community','personal'];
  if(allowed.includes(key))return key;
  if(key==='character'||key==='character_arc')return 'character_story';
  return '';
}

function applyQuestWorkshopDraft(draft){
  const c=qbQuest,plan=c.questPlan||{},state=questWorkshopState(),changes=[],issues=[];
  const oldLocation=c.location||'';
  if(draft.seen.title&&draft.title){c.title=draft.title.slice(0,120);changes.push('title');}
  if(draft.seen.summary&&draft.summary){c.hook=draft.summary;c.premise=draft.summary;plan.summary=draft.summary;changes.push('summary');}
  if(draft.seen.category){
    const category=questWorkshopCategory(draft.category);
    if(category){plan.category=category;changes.push('story type');}else if(draft.category)issues.push('Unknown story type “'+draft.category+'” was left unchanged.');
  }
  if(draft.seen.giver){
    const giver=resolveQuestWorkshopCharacter(draft.giver,false);
    if(giver!==null){c.character=giver;changes.push('quest giver');}
    else issues.push('Quest giver “'+draft.giver+'” does not match an imported NPC.');
  }
  if(draft.seen.cast){
    const participants=[],unknown=[];
    draft.cast.forEach(name=>{
      const id=resolveQuestWorkshopCharacter(name,true);
      if(id&&id!=='player'&&id!==c.character&&!participants.includes(id))participants.push(id);
      else if(id===null)unknown.push(name);
    });
    plan.participants=participants;changes.push('quest cast');
    if(unknown.length)issues.push('Unknown quest characters were skipped: '+unknown.join(', ')+'.');
  }
  if(draft.seen.setting){
    const location=resolveQuestWorkshopLocation(draft.location);
    if(location!==null){
      c.location=location;
      c.stages.forEach(stage=>{if(stage.id!=='branch'&&(!stage.location||stage.location===oldLocation))stage.location=location;});
      changes.push('primary location');
    }else issues.push('Location “'+draft.location+'” does not match an imported place.');
  }
  if(draft.seen.deadline){plan.deadline=draft.deadline;changes.push('deadline');}
  if(draft.seen.objectives&&draft.objectives.length){
    const existing=questObjectiveEntries(c);
    draft.objectives.forEach((title,i)=>{
      if(existing[i])existing[i].stage.title=title.slice(0,180);
      else{
        const stage={id:'objective_'+(i+1),title:title.slice(0,180),location:c.location||'',nodes:[],flag:'',requires:[]};
        const branchAt=c.stages.findIndex(x=>x.id==='branch');
        branchAt<0?c.stages.push(stage):c.stages.splice(branchAt,0,stage);
      }
    });
    if(existing.length>draft.objectives.length)issues.push('Extra existing objectives were preserved so written stage dialogue was not lost.');
    normalizeQuestObjectiveIds(c);changes.push(draft.objectives.length+' objectives');
  }
  if(draft.seen.rewards){
    const rows=draft.rewards.map(parseQuestWorkshopReward),mapped=rows.filter(Boolean);
    const unmapped=draft.rewards.filter((_,i)=>!rows[i]);
    if(mapped.length){
      plan.rewardRows=mapped;plan.rewards=[questRewardRowsToEffects(mapped),plan.advancedRewards||''].filter(Boolean).join('; ');
      changes.push(mapped.length+' rewards');
    }
    state.unmappedRewards=unmapped;
    if(unmapped.length)issues.push('Some reward ideas need review in the guided menus: '+unmapped.join('; ')+'.');
  }
  if(draft.seen.branches){plan.branchIdeas=draft.branches.join('\n');changes.push('branch notes');}
  const eventMentioned=['followup','event_title','date','block','location'].some(key=>draft.seen[key])&&
    (draft.seen.followup||draft.seen.event_title||draft.seen.date||draft.seen.block);
  if(eventMentioned){
    if(draft.event.clear){plan.event=null;plan.eventDraft=null;changes.push('follow-up event');}
    else{
      const previous=plan.eventDraft||plan.event||{};
      const eventDraft=Object.assign({},previous);
      if(draft.seen.event_title||draft.seen.followup)eventDraft.title=draft.event.title||'';
      if(draft.seen.date)eventDraft.date=draft.event.date||'';
      if(draft.seen.block){
        const block=slug(draft.event.block);
        if(BLOCKS.includes(block))eventDraft.block=block;else if(draft.event.block)issues.push('Unknown time block “'+draft.event.block+'” was left unchanged.');
      }
      if(draft.seen.location&&draft.event.location){
        const location=resolveQuestWorkshopLocation(draft.event.location);
        if(location!==null)eventDraft.location=location;else issues.push('Follow-up location “'+draft.event.location+'” was left unchanged.');
      }
      eventDraft.location=eventDraft.location||c.location||'';plan.eventDraft=eventDraft;
      const participants=[c.character,...(plan.participants||[])].filter(Boolean);
      plan.event=eventDraft.date&&eventDraft.block?{id:'event_'+c.id,title:eventDraft.title||c.title,date:eventDraft.date,
        block:eventDraft.block,location:eventDraft.location,participants:[...new Set(participants)],source:c.id,type:'story_event'}:null;
      if(!plan.event)issues.push('The follow-up was kept as a draft until it has both a game date and time block.');
      changes.push('follow-up event');
    }
  }
  state.lastDraft=draft.raw;plan.workshop=state;c.questPlan=plan;
  qbRewardRows=(plan.rewardRows||[]).map(row=>Object.assign({},row));
  qbParticipants=(plan.participants||[]).slice();
  save();paintAll();
  return {changes:[...new Set(changes)],issues};
}

function questWorkshopDraftPrompt(state){
  const characters=P.characters.filter(c=>!isPlayer(c)).map(c=>c.name+' = '+c.id).join(', ');
  const places=P.locations.map(place=>place.name+' = '+place.id+(place.rooms?.length?' [rooms: '+place.rooms.map(room=>room.name+' = '+place.id+'.'+room.id).join(', ')+']':'')).join('\n');
  return 'Turn this quest-design conversation into one editable quest worksheet. Use only what the writer chose or clearly favored; unresolved ideas may stay blank.\n'+
    'The Player is the changing real user of each new game, so never give the Player a fixed identity.\n'+
    'Reply in ordinary labeled text only: no JSON, no code block, and no explanation before or after the worksheet.\n'+
    'Use exact imported IDs for the giver, cast, and locations. Every objective must be one concrete playable action.\n'+
    'Rewards must be one per line in one of these forms: npc_id.trust +3, npc_id.love +1, player.confidence +2, or player.stress -3. Amounts must be from -5 to +5 and cannot be zero.\n\n'+
    'Use this forgiving worksheet:\n'+
    'TITLE: ...\nCATEGORY: character_story | relationship | work | school | community | personal\nGIVER: npc_id\nCAST: npc_id, npc_id\nSETTING: location_id\n'+
    'SUMMARY: one short paragraph\nDEADLINE: optional note\nOBJECTIVES:\n- ...\nREWARDS:\n- ...\nBRANCH IDEAS:\n- If a stat is at least a useful threshold, ...\n- Otherwise, ...\n'+
    'FOLLOW-UP EVENT:\nTITLE: optional\nDATE: optional Y1-MM-DD\nTIME: optional time block\nLOCATION: optional location_id\n\n'+
    '# Imported NPCs\n'+(characters||'none')+'\n\n# Imported locations\n'+(places||'none')+'\n\n'+
    '# Current quest before changes\n'+questWorkshopContext()+'\n\n# Conversation\n'+questWorkshopTranscript(state.messages);
}

async function buildQuestFromWorkshop(){
  if(qwWorking)return;
  const state=questWorkshopState();if(!state.messages.length)return;
  qwAbort=new AbortController();setQuestWorkshopBusy(true,'Building an editable quest plan…');
  let result=null,finalStatus='Enter sends · Shift+Enter adds a line';
  try{
    const raw=String(await askModel(questWorkshopDraftPrompt(state),qwAbort.signal,false)||'').trim();
    if(!raw)throw new Error('The AI returned an empty worksheet.');
    result=applyQuestWorkshopDraft(parseQuestWorkshopDraft(raw));
  }catch(error){
    finalStatus=error.name==='AbortError'?'Quest build stopped.':'Could not build the quest plan: '+error.message;
  }finally{
    qwAbort=null;setQuestWorkshopBusy(false,finalStatus);paintQuestWorkshop();
  }
  if(!result)return;
  if($('questWorkshop').open)$('questWorkshop').close();
  openQuestBuilder();
  const updated=result.changes.length?result.changes.join(', '):'the existing planning notes';
  const review=result.issues.length?' Review: '+result.issues.join(' '):'';
  note('Workshop updated '+esc(updated)+'. Review the fields, then save the quest plan.'+esc(review));
}

$('qbWorkshopButton').onclick=openQuestWorkshop;
$('qwClose').onclick=returnFromQuestWorkshop;
$('qwStop').onclick=()=>qwAbort&&qwAbort.abort();
$('qwSend').onclick=sendQuestWorkshopMessage;
$('qwRegenerate').onclick=regenerateQuestWorkshopReply;
$('qwBuild').onclick=buildQuestFromWorkshop;
$('qwSpeaker').onchange=()=>{const state=questWorkshopState();state.speaker=$('qwSpeaker').value;save();};
$('qwClear').onclick=()=>{
  const state=questWorkshopState();
  if(state.messages.length&&!window.confirm('Clear this quest workshop conversation? The quest plan itself will stay unchanged.'))return;
  state.messages=[];state.lastDraft='';state.unmappedRewards=[];save();paintQuestWorkshop();$('qwInput').focus();
};
document.querySelectorAll('[data-qw-prompt]').forEach(button=>button.onclick=()=>{
  $('qwInput').value=button.dataset.qwPrompt;$('qwInput').focus();
});
$('qwInput').addEventListener('keydown',event=>{
  if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();sendQuestWorkshopMessage();}
});
$('questWorkshop').addEventListener('keydown',event=>{
  if(event.key==='Escape'){event.preventDefault();event.stopPropagation();returnFromQuestWorkshop();}
});
