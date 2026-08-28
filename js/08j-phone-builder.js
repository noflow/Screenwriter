/* ============ phone text-message builder ============ */
let pbOwnerId='',pbSelectedMessageId='';

const PHONE_METERS=['friendship','trust','love','respect','comfort','attraction','commitment','compatibility','satisfaction','resentment','jealousy','lust'];
const PHONE_TRIGGER_KEYS=['sandbox_activated','quest_started','objective_completed','hours_after_quest','hours_before_calendar_event','message_sent','message_replied','reply_selected'];
const PHONE_EFFECTS=[
  ['add_meter','Relationship meter'],['start_quest','Start quest'],['complete_objective','Complete objective'],
  ['complete_quest','Complete quest'],['set_quest_state','Defer / fail quest'],['set_flag','Set flag'],
  ['set_value','Set game value'],['open_calendar_scheduler','Open calendar scheduler'],
  ['open_calendar_rescheduler','Open calendar rescheduler']
];
const PHONE_CONDITIONS=[
  ['meter_at_least','Relationship at least'],['meter_at_most','Relationship at most'],
  ['flag','Flag is set'],['flag_not','Flag is not set'],['value_equals','Game value equals']
];

const phoneClone=value=>JSON.parse(JSON.stringify(value));
const phoneOwners=()=>P.characters.filter(c=>!isPlayer(c));
const phoneOwner=id=>phoneOwners().find(c=>c.id===id)||null;
function phoneMessages(ownerId){
  const owner=phoneOwner(ownerId);if(!owner)return [];
  if(!Array.isArray(owner.text_messages))owner.text_messages=[];
  return owner.text_messages;
}
function phoneDirection(message,ownerId){
  if(message?.direction==='outgoing'||message?.direction==='incoming')return message.direction;
  return message?.sender==='player'?'outgoing':'incoming';
}
function phoneAllMessages(){
  return phoneOwners().flatMap(owner=>phoneMessages(owner.id).map(message=>({owner,message})));
}
function phoneMessageById(ownerId,messageId){return phoneMessages(ownerId).find(m=>m&&m.id===messageId)||null;}
function phoneUniqueMessageId(ownerId,raw,except=null){
  const base=slug(raw||ownerId+'_text')||'text',used=new Set(phoneAllMessages().filter(entry=>entry.message!==except).map(entry=>entry.message?.id));
  if(!used.has(base))return base;
  let n=2;while(used.has(base+'_'+n))n++;return base+'_'+n;
}
function phoneUniqueReplyId(message,raw,except=null){
  const base=slug(raw||message.id+'_reply')||'reply',used=new Set((message.quick_replies||[]).filter(r=>r!==except).map(r=>r?.id));
  if(!used.has(base))return base;
  let n=2;while(used.has(base+'_'+n))n++;return base+'_'+n;
}
function ensurePhoneReplyShape(reply,message,index){
  if(!reply||typeof reply!=='object'||Array.isArray(reply))reply={};
  // The game has always addressed legacy id-less replies as reply_0, reply_1,
  // and so on. Keep that fallback when the editor first opens an old message
  // so existing reply_selected follow-ups do not become stranded.
  if(!reply.id)reply.id=phoneUniqueReplyId(message,'reply_'+index,reply);
  if(typeof reply.text!=='string')reply.text=String(reply.text||'');
  if(!Array.isArray(reply.tone))reply.tone=reply.tone?[String(reply.tone)]:[];
  if(!Array.isArray(reply.effects))reply.effects=[];
  return reply;
}
function ensurePhoneMessageShape(message,ownerId){
  if(!message||typeof message!=='object'||Array.isArray(message))message={};
  if(!message.id)message.id=phoneUniqueMessageId(ownerId,ownerId+'_text',message);
  message.direction=phoneDirection(message,ownerId);
  message.sender=message.direction==='outgoing'?'player':ownerId;
  if(typeof message.text!=='string')message.text=String(message.text||'');
  if(!message.trigger||typeof message.trigger!=='object'||Array.isArray(message.trigger))message.trigger={};
  if(!Array.isArray(message.quick_replies))message.quick_replies=[];
  message.quick_replies=message.quick_replies.map((reply,index)=>ensurePhoneReplyShape(reply,message,index));
  if(message.direction==='outgoing'){
    if(!Array.isArray(message.effects))message.effects=[];
  }else if(Array.isArray(message.effects)&&message.effects.length===0)delete message.effects;
  return message;
}
function phoneUpsertMessage(ownerId,message){
  const owner=phoneOwner(ownerId);if(!owner)throw new Error('Choose an NPC contact first.');
  const list=phoneMessages(ownerId),prepared=ensurePhoneMessageShape(message,ownerId);
  const collision=phoneAllMessages().find(entry=>entry.owner.id!==ownerId&&entry.message!==message&&entry.message?.id===prepared.id);
  if(collision)prepared.id=phoneUniqueMessageId(ownerId,prepared.id,prepared);
  const at=list.findIndex(item=>item===message||item?.id===prepared.id);
  at<0?list.push(prepared):list[at]=prepared;return prepared;
}
function phoneRemoveMessage(ownerId,messageId){
  const owner=phoneOwner(ownerId);if(!owner)return false;
  const before=phoneMessages(ownerId).length;
  owner.text_messages=phoneMessages(ownerId).filter(message=>message?.id!==messageId);
  return owner.text_messages.length!==before;
}
function phoneMessageTriggerKind(message){
  const trigger=message?.trigger||{};
  return PHONE_TRIGGER_KEYS.find(key=>Object.prototype.hasOwnProperty.call(trigger,key))||'always';
}
function phoneTriggerSummary(message){
  const t=message?.trigger||{},kind=phoneMessageTriggerKind(message);
  const summary={
    sandbox_activated:'when the sandbox begins',quest_started:'when quest '+(t.quest_started||'?')+' starts',
    objective_completed:'after '+((t.objective_completed||[])[1]||'an objective'),
    hours_after_quest:((t.hours_after_quest||[])[1]||0)+'h after '+((t.hours_after_quest||[])[0]||'a quest'),
    hours_before_calendar_event:((t.hours_before_calendar_event||[])[1]||0)+'h before '+((t.hours_before_calendar_event||[])[0]||'an event'),
    message_sent:'after '+(Array.isArray(t.message_sent)?t.message_sent[1]:t.message_sent||'a text')+' is sent',
    message_replied:'after any reply to '+(Array.isArray(t.message_replied)?t.message_replied[1]:t.message_replied||'a text'),
    reply_selected:'after reply '+((t.reply_selected||[])[1]||'?')+' to '+((t.reply_selected||[])[0]||'a text'),always:'always available'
  }[kind];
  const gates=[];if(t.days)gates.push((Array.isArray(t.days)?t.days:[t.days]).join('/'));
  if(t.blocks)gates.push((Array.isArray(t.blocks)?t.blocks:[t.blocks]).join('/'));
  if(t.flag)gates.push('flag '+t.flag);if(t.flag_not)gates.push('without '+t.flag_not);
  if(t.meter_at_least)gates.push((t.meter_at_least.at(-2)||'meter')+' ≥ '+t.meter_at_least.at(-1));
  if(t.meter_at_most)gates.push((t.meter_at_most.at(-2)||'meter')+' ≤ '+t.meter_at_most.at(-1));
  return summary+(gates.length?' · '+gates.join(' · '):'');
}
function phoneEffectDefault(operation,ownerId){
  const quest=P.content.find(c=>c.type==='quest');
  switch(operation){
    case 'add_meter':return {operation,character:ownerId,meter:'trust',value:1};
    case 'start_quest':return {operation,quest:quest?.id||''};
    case 'complete_objective':return {operation,quest:quest?.id||'',objective:quest?.stages?.find(s=>s.id!=='branch')?.id||''};
    case 'complete_quest':return {operation,quest:quest?.id||''};
    case 'set_quest_state':return {operation,quest:quest?.id||'',value:'deferred'};
    case 'set_flag':return {operation,key:'story.flag',value:true};
    case 'set_value':return {operation,key:'story.value',value:true};
    case 'open_calendar_scheduler':return {operation,participant:ownerId,valid_quest:quest?.id||''};
    case 'open_calendar_rescheduler':return {operation,event:'event_id'};
    default:return {operation};
  }
}
function makePhoneMessage(ownerId,template='blank'){
  const owner=phoneOwner(ownerId),quest=P.content.find(c=>c.type==='quest'),questId=quest?.id||'';
  const message={id:'',direction:'incoming',sender:ownerId,trigger:{sandbox_activated:true},text:'',quick_replies:[],effects:[]};
  if(template==='checkin'){
    message.text='Hey—how are you doing?';message.quick_replies=[
      {text:'Doing okay. Thanks for checking in.',tone:['warm'],effects:[phoneEffectDefault('add_meter',ownerId)]},
      {text:'Can I text you later?',tone:['honest'],effects:[]}];
  }else if(template==='quest_offer'){
    message.text='Could you help me with something?';
    message.quick_replies=[{text:'Sure. What do you need?',tone:['helpful'],effects:[{operation:'start_quest',quest:questId}]}];
  }else if(template==='reminder'){
    message.trigger={hours_before_calendar_event:['event_id',2]};message.text='Just a reminder—we are meeting in two hours.';
    message.quick_replies=[{text:"I'll be there.",tone:['responsible'],effects:[]},{text:'I need to reschedule.',tone:['honest'],effects:[{operation:'open_calendar_rescheduler',event:'event_id'}]}];
  }else if(template==='followup'){
    message.trigger={hours_after_quest:[questId,3]};message.text='How did everything go?';
    message.quick_replies=[{text:'It went well. Thanks.',tone:['warm'],effects:[phoneEffectDefault('add_meter',ownerId)]}];
  }else if(template==='player_text'){
    message.direction='outgoing';message.sender='player';message.trigger={};message.text='Hey, are you free to talk?';message.quick_replies=[];
  }
  message.id=phoneUniqueMessageId(ownerId,ownerId+'_'+({blank:'text',checkin:'checkin',quest_offer:'quest_offer',reminder:'reminder',followup:'followup',player_text:'player_text'}[template]||'text'));
  message.quick_replies=message.quick_replies.map((reply,index)=>ensurePhoneReplyShape(reply,message,index));
  return ensurePhoneMessageShape(message,ownerId);
}

function phonePersist(repaint=false){save();paintTextMessageSummary();if(repaint){paintPhoneContacts();paintPhoneMessages();}}
function paintTextMessageSummary(){
  if(typeof $!=='function')return;const box=$('textMessageSummary');if(!box)return;
  const owners=phoneOwners().filter(owner=>Array.isArray(owner.text_messages)&&owner.text_messages.length),total=owners.reduce((n,owner)=>n+owner.text_messages.length,0);
  box.textContent=total?total+' authored text'+(total===1?'':'s')+' across '+owners.length+' contact'+(owners.length===1?'':'s'):'No authored texts yet';
}
function phoneInitials(name){return String(name||'?').split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase();}
function paintPhoneContacts(){
  const box=$('pbContacts');if(!box)return;const owners=phoneOwners();
  box.innerHTML=owners.length?owners.map(owner=>'<button class="phone-contact-button'+(owner.id===pbOwnerId?' on':'')+'" data-pb-owner="'+esc(owner.id)+'"><span class="phone-contact-avatar">'+esc(phoneInitials(owner.name))+'</span><span><b>'+esc(owner.name||pretty(owner.id))+'</b><small>'+esc(owner.id)+'</small></span><small class="phone-contact-count">'+phoneMessages(owner.id).length+'</small></button>').join(''):'<div class="phone-message-empty">Import or create an NPC before writing texts.</div>';
  box.querySelectorAll('[data-pb-owner]').forEach(button=>button.onclick=()=>{
    pbOwnerId=button.dataset.pbOwner;const first=phoneMessages(pbOwnerId)[0];pbSelectedMessageId=first?.id||'';paintPhoneBuilder();
  });
}
function paintPhoneMessages(){
  const box=$('pbMessages');if(!box)return;const owner=phoneOwner(pbOwnerId),list=owner?phoneMessages(owner.id):[];
  $('pbContactSummary').textContent=owner?(list.length+' message'+(list.length===1?'':'s')+' on '+(owner.name||owner.id)):'Choose a contact';
  box.innerHTML=list.length?list.map(message=>{
    const direction=phoneDirection(message,pbOwnerId);
    return '<button class="phone-message-card '+direction+(message.id===pbSelectedMessageId?' on':'')+'" data-pb-message="'+esc(message.id)+'"><b>'+esc(message.id||'Untitled text')+'</b><span class="direction">'+(direction==='incoming'?'NPC → Player':'Player → NPC')+'</span><p>'+esc(message.text||'No text written yet')+'</p></button>';
  }).join(''):'<div class="phone-message-empty">No texts for this contact yet.<br>Choose Blank or a template above.</div>';
  box.querySelectorAll('[data-pb-message]').forEach(button=>button.onclick=()=>{pbSelectedMessageId=button.dataset.pbMessage;paintPhoneMessages();paintPhoneEditor();});
}
function phoneQuestOptions(current=''){
  const rows=P.content.filter(c=>c.type==='quest').map(q=>[q.id,q.title||q.id]);
  if(current&&!rows.some(row=>row[0]===current))rows.unshift([current,pretty(current)+' (missing)']);
  return '<option value="">— choose quest —</option>'+rows.map(([id,label])=>'<option value="'+esc(id)+'"'+(id===current?' selected':'')+'>'+esc(label)+'</option>').join('');
}
function phoneCharacterOptions(current=''){
  const rows=[...phoneOwners()];
  if(current&&!rows.some(row=>row.id===current))rows.push({id:current,name:pretty(current)+' (missing)'});
  return rows.map(c=>'<option value="'+esc(c.id)+'"'+(c.id===current?' selected':'')+'>'+esc(c.name||c.id)+'</option>').join('');
}
function phoneMessageReferenceOptions(current,ownerId){
  const rows=phoneAllMessages().filter(x=>phoneDirection(x.message,x.owner.id)==='outgoing').map(x=>({value:x.owner.id+'\t'+x.message.id,label:(x.owner.name||x.owner.id)+' — '+x.message.id}));
  const encoded=Array.isArray(current)?current[0]+'\t'+current[1]:ownerId+'\t'+(current||'');
  if(encoded&&!rows.some(row=>row.value===encoded))rows.unshift({value:encoded,label:encoded.replace('\t',' — ')+' (missing)'});
  return '<option value="">— choose text —</option>'+rows.map(row=>'<option value="'+esc(row.value)+'"'+(row.value===encoded?' selected':'')+'>'+esc(row.label)+'</option>').join('');
}
function phoneIncomingReferenceOptions(current,ownerId){
  const rows=phoneMessages(ownerId).filter(message=>phoneDirection(message,ownerId)==='incoming').map(message=>({value:message.id,label:message.id+' — '+(message.text||'No text')}));
  if(current&&!rows.some(row=>row.value===current))rows.unshift({value:current,label:current+' (missing)'});
  return '<option value="">— choose incoming text —</option>'+rows.map(row=>'<option value="'+esc(row.value)+'"'+(row.value===current?' selected':'')+'>'+esc(row.label)+'</option>').join('');
}
function phoneAllIncomingReferenceOptions(current,ownerId){
  const rows=phoneAllMessages().filter(x=>phoneDirection(x.message,x.owner.id)==='incoming').map(x=>({value:x.owner.id+'\t'+x.message.id,label:(x.owner.name||x.owner.id)+' — '+x.message.id}));
  const encoded=Array.isArray(current)?current[0]+'\t'+current[1]:ownerId+'\t'+(current||'');
  if(encoded&&!rows.some(row=>row.value===encoded))rows.unshift({value:encoded,label:encoded.replace('\t',' — ')+' (missing)'});
  return '<option value="">— choose incoming text —</option>'+rows.map(row=>'<option value="'+esc(row.value)+'"'+(row.value===encoded?' selected':'')+'>'+esc(row.label)+'</option>').join('');
}
function phoneCalendarEventOptions(current=''){
  const rows=[];
  P.content.filter(item=>item.type==='quest').forEach(quest=>{
    const event=quest.questPlan?.event;if(event?.id)rows.push([event.id,event.title||event.id]);
    else if(quest.questPlan?.eventDraft&&(quest.questPlan.eventDraft.date||quest.questPlan.eventDraft.block))rows.push(['event_'+quest.id,quest.questPlan.eventDraft.title||'Event after '+(quest.title||quest.id)]);
  });
  if(current&&!rows.some(row=>row[0]===current))rows.unshift([current,pretty(current)+(current==='event_id'?' — replace with a planned event':' (missing)')]);
  return '<option value="">— choose calendar event —</option>'+rows.map(([id,label])=>'<option value="'+esc(id)+'"'+(id===current?' selected':'')+'>'+esc(label)+'</option>').join('');
}
function paintPhoneTrigger(message){
  const t=message.trigger||{},kind=phoneMessageTriggerKind(message);$('pbTriggerType').value=kind;
  let current='',options='<option value="">— not set —</option>',refLabel='Reference',detail='',detailLabel='Objective / hours',detailVisible=true;
  if(kind==='quest_started'){current=t.quest_started||'';options=phoneQuestOptions(current);refLabel='Quest';detailVisible=false;}
  else if(kind==='objective_completed'){current=t.objective_completed?.[0]||'';detail=t.objective_completed?.[1]||'';options=phoneQuestOptions(current);refLabel='Quest';detailLabel='Objective ID';}
  else if(kind==='hours_after_quest'){current=t.hours_after_quest?.[0]||'';detail=t.hours_after_quest?.[1]??3;options=phoneQuestOptions(current);refLabel='Completed quest';detailLabel='Hours later';}
  else if(kind==='hours_before_calendar_event'){current=t.hours_before_calendar_event?.[0]||'';detail=t.hours_before_calendar_event?.[1]??2;options=phoneCalendarEventOptions(current);refLabel='Calendar event';detailLabel='Hours before';}
  else if(kind==='message_sent'){current=t.message_sent||'';options=phoneMessageReferenceOptions(current,pbOwnerId);refLabel='Sent text';detailVisible=false;}
  else if(kind==='message_replied'){current=t.message_replied||'';options=phoneAllIncomingReferenceOptions(current,pbOwnerId);refLabel='Incoming text';detailVisible=false;}
  else if(kind==='reply_selected'){current=t.reply_selected?.[0]||'';detail=t.reply_selected?.[1]||'';options=phoneIncomingReferenceOptions(current,pbOwnerId);refLabel='Incoming text';detailLabel='Stable reply ID';}
  else {detailVisible=false;refLabel=kind==='always'?'No reference needed':'Sandbox';options='<option value="">— no reference needed —</option>';}
  $('pbTriggerRef').innerHTML=options;$('pbTriggerRef').value=['message_sent','message_replied'].includes(kind)?(Array.isArray(current)?current[0]+'\t'+current[1]:pbOwnerId+'\t'+current):current;
  $('pbTriggerRefLabel').textContent=refLabel;$('pbTriggerDetail').value=detail;$('pbTriggerDetailLabel').textContent=detailLabel;$('pbTriggerDetailField').hidden=!detailVisible;
  let suggestions=[];
  if(kind==='objective_completed')suggestions=(P.content.find(q=>q.type==='quest'&&q.id===current)?.stages||[]).filter(stage=>stage.id!=='branch').map(stage=>stage.id);
  if(kind==='reply_selected')suggestions=(phoneMessageById(pbOwnerId,current)?.quick_replies||[])
    .map((reply,index)=>reply.id||'reply_'+index);
  $('pbTriggerDetailChoices').innerHTML=suggestions.map(value=>'<option value="'+esc(value)+'"></option>').join('');
  const selectedDays=new Set(Array.isArray(t.days)?t.days:(t.days?[t.days]:[])),selectedBlocks=new Set(Array.isArray(t.blocks)?t.blocks:(t.blocks?[t.blocks]:[]));
  $('pbDay').querySelectorAll('input').forEach(input=>input.checked=selectedDays.has(input.value));$('pbBlock').querySelectorAll('input').forEach(input=>input.checked=selectedBlocks.has(input.value));
  $('pbFlagGate').value=t.flag||t.flag_not||'';$('pbFlagMode').value=t.flag_not?'not':'set';
  const meter=t.meter_at_least||t.meter_at_most||[];$('pbMeterGate').value=meter.length?meter.at(-2):'';$('pbMeterOp').value=t.meter_at_most?'at_most':'at_least';$('pbMeterValue').value=meter.length?meter.at(-1):50;
}
function readPhoneTrigger(message,section='all'){
  const existing=message.trigger&&typeof message.trigger==='object'&&!Array.isArray(message.trigger)?message.trigger:{};
  const kind=$('pbTriggerType').value,ref=$('pbTriggerRef').value,detail=$('pbTriggerDetail').value.trim();
  if(section==='all'||section==='event'){
    PHONE_TRIGGER_KEYS.forEach(key=>delete existing[key]);
    if(kind==='sandbox_activated')existing.sandbox_activated=true;
    else if(kind==='quest_started'&&ref)existing.quest_started=ref;
    else if(kind==='objective_completed'&&(ref||detail))existing.objective_completed=[ref,detail];
    else if(kind==='hours_after_quest'&&(ref||detail))existing.hours_after_quest=[ref,Math.max(0,+detail||0)];
    else if(kind==='hours_before_calendar_event'&&(ref||detail))existing.hours_before_calendar_event=[ref,Math.max(0,+detail||0)];
    else if(kind==='message_sent'&&ref){const [owner,id]=ref.split('\t');existing.message_sent=owner&&owner!==pbOwnerId?[owner,id]:id;}
    else if(kind==='message_replied'&&ref){const [owner,id]=ref.split('\t');existing.message_replied=owner&&owner!==pbOwnerId?[owner,id]:id;}
    else if(kind==='reply_selected'&&(ref||detail))existing.reply_selected=[ref,detail];
  }
  const days=[...$('pbDay').querySelectorAll('input:checked')].map(input=>input.value),blocks=[...$('pbBlock').querySelectorAll('input:checked')].map(input=>input.value),flag=$('pbFlagGate').value.trim();
  if(section==='all'||section==='day')days.length?existing.days=days:delete existing.days;
  if(section==='all'||section==='block')blocks.length?existing.blocks=blocks:delete existing.blocks;
  if(section==='all'||section==='flag'){delete existing.flag;delete existing.flag_not;if(flag)existing[$('pbFlagMode').value==='not'?'flag_not':'flag']=flag;}
  if(section==='all'||section==='meter'){
    delete existing.meter_at_least;delete existing.meter_at_most;
    const meter=$('pbMeterGate').value;if(meter)existing['meter_'+$('pbMeterOp').value]=[pbOwnerId,meter,+$('pbMeterValue').value||0];
  }
  message.trigger=existing;return existing;
}
function paintPhonePreview(message){
  const owner=phoneOwner(pbOwnerId),direction=phoneDirection(message,pbOwnerId),bubble=$('pbPreviewBubble');
  $('pbPreviewContact').textContent=owner?.name||pretty(pbOwnerId);bubble.className='phone-preview-bubble '+direction+(message.text?'':' placeholder');bubble.textContent=message.text||'Your exact message will appear here.';
  $('pbDirectionBadge').textContent=direction==='incoming'?'Incoming · NPC to Player':'Outgoing · Player to NPC';
}
function phoneKnownEffect(operation){return PHONE_EFFECTS.some(row=>row[0]===operation);}
function phoneConditionKind(condition){return PHONE_CONDITIONS.find(([key])=>Object.prototype.hasOwnProperty.call(condition||{},key))?.[0]||'';}
function phoneConditionDefault(kind,ownerId){
  if(kind==='meter_at_least'||kind==='meter_at_most')return {[kind]:[ownerId,'trust',50]};
  if(kind==='flag'||kind==='flag_not')return {[kind]:'story.flag'};
  if(kind==='value_equals')return {value_equals:['story.value',true]};
  return {};
}
function phoneConditionFields(condition,kind,ownerId){
  if(kind==='meter_at_least'||kind==='meter_at_most'){
    const value=condition[kind]||[],character=value.length===3?value[0]:ownerId,meter=value.length===3?value[1]:value[0],amount=value.length===3?value[2]:value[1];
    return '<select data-pb-condition-character>'+phoneCharacterOptions(character||ownerId)+'</select><select data-pb-condition-meter>'+PHONE_METERS.map(item=>'<option'+(item===meter?' selected':'')+'>'+item+'</option>').join('')+'</select><input data-pb-condition-value type="number" value="'+esc(amount??50)+'" aria-label="Threshold">';
  }
  if(kind==='flag'||kind==='flag_not')return '<input data-pb-condition-key value="'+esc(condition[kind]||'')+'" placeholder="flag key">';
  if(kind==='value_equals'){const value=condition.value_equals||[];return '<input data-pb-condition-key value="'+esc(value[0]||'')+'" placeholder="game value path"><input data-pb-condition-value value="'+esc(stateValueText(value[1]))+'" placeholder="expected value">';}
  return '<span class="hint">Imported condition kept unchanged.</span>';
}
function paintPhoneConditions(container,conditions,ownerId){
  if(conditions===undefined||conditions===null)conditions=[];
  if(!Array.isArray(conditions)){container.innerHTML='<div class="phone-reply-empty">Imported condition data is kept unchanged. Add a row to replace it.</div>';return;}
  container.innerHTML=conditions.length?conditions.map((condition,index)=>{
    const kind=phoneConditionKind(condition),options=PHONE_CONDITIONS.map(([value,label])=>'<option value="'+value+'"'+(kind===value?' selected':'')+'>'+label+'</option>').join('');
    return '<div class="phone-condition-row" data-phone-condition="'+index+'"><select data-pb-condition-kind>'+(!kind?'<option value="__unknown__" selected>Keep imported condition</option>':'')+options+'</select><div class="phone-condition-fields">'+phoneConditionFields(condition,kind,ownerId)+'</div><button class="x" data-pb-condition-remove aria-label="Remove condition">×</button></div>';
  }).join(''):'<div class="phone-reply-empty">No additional conditions.</div>';
  container.querySelectorAll('[data-phone-condition]').forEach(row=>{
    const index=+row.dataset.phoneCondition,condition=conditions[index],kind=phoneConditionKind(condition);
    row.querySelector('[data-pb-condition-kind]').onchange=event=>{if(event.target.value==='__unknown__')return;conditions[index]=phoneConditionDefault(event.target.value,ownerId);paintPhoneConditions(container,conditions,ownerId);phonePersist();};
    const update=()=>{
      if(kind==='meter_at_least'||kind==='meter_at_most')condition[kind]=[row.querySelector('[data-pb-condition-character]').value,row.querySelector('[data-pb-condition-meter]').value,+row.querySelector('[data-pb-condition-value]').value||0];
      else if(kind==='flag'||kind==='flag_not')condition[kind]=row.querySelector('[data-pb-condition-key]').value.trim();
      else if(kind==='value_equals')condition.value_equals=[row.querySelector('[data-pb-condition-key]').value.trim(),stateScalar(row.querySelector('[data-pb-condition-value]').value)];
      phonePersist();
    };
    row.querySelectorAll('[data-pb-condition-character],[data-pb-condition-meter],[data-pb-condition-key],[data-pb-condition-value]').forEach(input=>{input.oninput=update;input.onchange=update;});
    row.querySelector('[data-pb-condition-remove]').onclick=()=>{conditions.splice(index,1);paintPhoneConditions(container,conditions,ownerId);phonePersist();};
  });
}
function phoneEffectFields(effect,ownerId){
  const op=effect.operation||'';
  if(!phoneKnownEffect(op))return '<span class="hint">Imported effect kept unchanged.</span>';
  if(op==='add_meter')return '<select data-pb-effect-field="character">'+phoneCharacterOptions(effect.character||ownerId)+'</select><select data-pb-effect-field="meter">'+PHONE_METERS.map(m=>'<option'+(m===effect.meter?' selected':'')+'>'+m+'</option>').join('')+'</select><input data-pb-effect-field="value" data-phone-number type="number" value="'+esc(effect.value??1)+'" aria-label="Amount">';
  if(op==='start_quest'||op==='complete_quest')return '<select data-pb-effect-field="quest">'+phoneQuestOptions(effect.quest||effect.value||'')+'</select>';
  if(op==='complete_objective')return '<select data-pb-effect-field="quest">'+phoneQuestOptions(effect.quest||'')+'</select><input data-pb-effect-field="objective" value="'+esc(effect.objective||'')+'" placeholder="objective ID">';
  if(op==='set_quest_state')return '<select data-pb-effect-field="quest">'+phoneQuestOptions(effect.quest||'')+'</select><select data-pb-effect-field="value"><option value="deferred"'+(effect.value==='deferred'?' selected':'')+'>Defer</option><option value="failed"'+(effect.value==='failed'?' selected':'')+'>Fail</option></select>';
  if(op==='set_flag')return '<input data-pb-effect-field="key" value="'+esc(effect.key||'')+'" placeholder="flag key"><select data-pb-effect-field="value" data-phone-bool><option value="true"'+(effect.value!==false?' selected':'')+'>True</option><option value="false"'+(effect.value===false?' selected':'')+'>False</option></select>';
  if(op==='set_value')return '<input data-pb-effect-field="key" value="'+esc(effect.key||'')+'" placeholder="game value key"><input data-pb-effect-field="value" data-phone-scalar value="'+esc(stateValueText(effect.value))+'" placeholder="value">';
  if(op==='open_calendar_scheduler')return '<select data-pb-effect-field="participant">'+phoneCharacterOptions(effect.participant||ownerId)+'</select><select data-pb-effect-field="valid_quest">'+phoneQuestOptions(effect.valid_quest||'')+'</select>';
  if(op==='open_calendar_rescheduler')return '<input data-pb-effect-field="event" value="'+esc(effect.event||effect.value||'')+'" placeholder="calendar event ID">';
  return '';
}
function paintPhoneEffects(container,effects,ownerId){
  if(!Array.isArray(effects))effects=[];
  container.innerHTML=effects.length?effects.map((effect,index)=>{
    const known=phoneKnownEffect(effect?.operation),options=PHONE_EFFECTS.map(([value,label])=>'<option value="'+value+'"'+(effect?.operation===value?' selected':'')+'>'+label+'</option>').join('');
    return '<div class="phone-effect-row" data-phone-effect="'+index+'"><select data-pb-effect-op>'+(!known?'<option value="__unknown__" selected>Keep imported: '+esc(effect?.operation||'unknown')+'</option>':'')+options+'</select><div class="phone-effect-fields">'+phoneEffectFields(effect||{},ownerId)+'</div><button class="x" data-pb-effect-remove aria-label="Remove effect">×</button></div>';
  }).join(''):'<div class="phone-reply-empty">No effects. The text can still be sent normally.</div>';
  container.querySelectorAll('[data-phone-effect]').forEach(row=>{
    const index=+row.dataset.phoneEffect;
    row.querySelector('[data-pb-effect-op]').onchange=event=>{if(event.target.value==='__unknown__')return;effects[index]=phoneEffectDefault(event.target.value,ownerId);paintPhoneEffects(container,effects,ownerId);phonePersist();};
    row.querySelectorAll('[data-pb-effect-field]').forEach(input=>{
      const change=()=>{let value=input.value;if(input.hasAttribute('data-phone-number'))value=+value||0;else if(input.hasAttribute('data-phone-bool'))value=value==='true';else if(input.hasAttribute('data-phone-scalar'))value=stateScalar(value);effects[index][input.dataset.pbEffectField]=value;phonePersist();};
      input.oninput=change;input.onchange=change;
    });
    row.querySelector('[data-pb-effect-remove]').onclick=()=>{effects.splice(index,1);paintPhoneEffects(container,effects,ownerId);phonePersist();};
  });
}
function paintPhoneReplies(message){
  const box=$('pbReplies');message.quick_replies=message.quick_replies.map((reply,index)=>ensurePhoneReplyShape(reply,message,index));
  box.innerHTML=message.quick_replies.length?message.quick_replies.map((reply,index)=>'<article class="phone-reply-card" data-phone-reply="'+index+'"><div class="phone-reply-head"><div class="field"><label>Reply text</label><input data-pb-reply-text value="'+esc(reply.text)+'" placeholder="Player reply"></div><div class="field"><label>Reply ID</label><input data-pb-reply-id value="'+esc(reply.id)+'" spellcheck="false"></div><div class="row"><button class="x" data-pb-reply-up title="Move up">↑</button><button class="x" data-pb-reply-down title="Move down">↓</button><button class="x" data-pb-reply-remove title="Remove reply">×</button></div></div><div class="field" style="margin-top:7px"><label>Tone tags <span class="hint">comma separated</span></label><input data-pb-reply-tone value="'+esc((reply.tone||[]).join(', '))+'" placeholder="warm, honest"></div><div class="phone-effects" data-pb-reply-effects></div><button class="btn phone-add-effect" data-pb-reply-add-effect>+ Effect for this reply</button><div class="phone-reply-gates"><div class="phone-section-title"><div><span class="hint">Show this reply only when every condition passes.</span></div><button class="btn quiet" data-pb-reply-add-condition>+ Reply condition</button></div><div class="phone-conditions" data-pb-reply-conditions></div></div></article>').join(''):'<div class="phone-reply-empty">No reply choices yet. Add one if the player should be able to answer.</div>';
  box.querySelectorAll('[data-phone-reply]').forEach(card=>{
    const index=+card.dataset.phoneReply,reply=message.quick_replies[index];
    card.querySelector('[data-pb-reply-text]').oninput=e=>{reply.text=e.target.value;phonePersist();};
    card.querySelector('[data-pb-reply-id]').onchange=e=>{e.target.value=renamePhoneReply(pbOwnerId,message,reply,e.target.value);phonePersist();};
    card.querySelector('[data-pb-reply-tone]').oninput=e=>{reply.tone=e.target.value.split(',').map(x=>x.trim()).filter(Boolean);phonePersist();};
    const effectsBox=card.querySelector('[data-pb-reply-effects]');paintPhoneEffects(effectsBox,reply.effects,pbOwnerId);
    const conditionsBox=card.querySelector('[data-pb-reply-conditions]');paintPhoneConditions(conditionsBox,reply.conditions,pbOwnerId);
    card.querySelector('[data-pb-reply-add-effect]').onclick=()=>{reply.effects.push(phoneEffectDefault('add_meter',pbOwnerId));paintPhoneEffects(effectsBox,reply.effects,pbOwnerId);phonePersist();};
    card.querySelector('[data-pb-reply-add-condition]').onclick=()=>{if(!Array.isArray(reply.conditions))reply.conditions=[];reply.conditions.push(phoneConditionDefault('meter_at_least',pbOwnerId));paintPhoneConditions(conditionsBox,reply.conditions,pbOwnerId);phonePersist();};
    card.querySelector('[data-pb-reply-remove]').onclick=()=>{message.quick_replies.splice(index,1);paintPhoneReplies(message);phonePersist();};
    card.querySelector('[data-pb-reply-up]').disabled=index===0;card.querySelector('[data-pb-reply-down]').disabled=index===message.quick_replies.length-1;
    card.querySelector('[data-pb-reply-up]').onclick=()=>{[message.quick_replies[index-1],message.quick_replies[index]]=[message.quick_replies[index],message.quick_replies[index-1]];paintPhoneReplies(message);phonePersist();};
    card.querySelector('[data-pb-reply-down]').onclick=()=>{[message.quick_replies[index+1],message.quick_replies[index]]=[message.quick_replies[index],message.quick_replies[index+1]];paintPhoneReplies(message);phonePersist();};
  });
}
function paintPhoneEditor(){
  let message=phoneMessageById(pbOwnerId,pbSelectedMessageId);$('pbEmpty').hidden=!!message;$('pbEditor').hidden=!message;if(!message)return;
  const before=JSON.stringify(message);message=ensurePhoneMessageShape(message,pbOwnerId);if(before!==JSON.stringify(message))phonePersist(true);
  $('pbMessageId').value=message.id;$('pbDirection').value=phoneDirection(message,pbOwnerId);$('pbText').value=message.text;$('pbIntroduces').checked=!!message.introduces_contact;
  paintPhoneTrigger(message);paintPhonePreview(message);
  const incoming=phoneDirection(message,pbOwnerId)==='incoming';$('pbRepliesSection').hidden=!incoming;$('pbOutgoingEffectsSection').hidden=incoming;$('pbIntroduces').disabled=!incoming;
  paintPhoneConditions($('pbConditions'),message.conditions,pbOwnerId);paintPhoneReplies(message);paintPhoneEffects($('pbOutgoingEffects'),message.effects,pbOwnerId);
}
function paintPhoneBuilder(){paintPhoneContacts();paintPhoneMessages();paintPhoneEditor();paintTextMessageSummary();}
function openPhoneBuilder(ownerId='',messageId=''){
  const owners=phoneOwners(),preferred=phoneOwner(ownerId)||phoneOwner(selChar)||owners[0]||null;pbOwnerId=preferred?.id||'';
  const list=preferred?phoneMessages(preferred.id):[];pbSelectedMessageId=messageId&&phoneMessageById(pbOwnerId,messageId)?messageId:(list[0]?.id||'');
  paintPhoneBuilder();$('phoneBuilder').showModal();
}
function addPhoneMessageFromTemplate(template='blank'){
  if(!phoneOwner(pbOwnerId))return;const message=makePhoneMessage(pbOwnerId,template);phoneMessages(pbOwnerId).push(message);pbSelectedMessageId=message.id;phonePersist();paintPhoneBuilder();$('pbText').focus();
}
function renamePhoneMessage(ownerId,message,nextRaw){
  const old=message.id,owner=phoneOwner(ownerId);
  const next=typeof renameTextMessageId==='function'?renameTextMessageId(owner,message,nextRaw):phoneUniqueMessageId(ownerId,nextRaw,message);
  if(old===next)return next;if(message.id!==next)message.id=next;
  phoneAllMessages().forEach(({owner,message:other})=>{
    const sent=other?.trigger?.message_sent;
    if(sent===old&&owner.id===ownerId)other.trigger.message_sent=next;
    else if(Array.isArray(sent)&&sent[0]===ownerId&&sent[1]===old)sent[1]=next;
    if(owner.id===ownerId&&other?.trigger?.message_replied===old)other.trigger.message_replied=next;
    if(Array.isArray(other?.trigger?.message_replied)&&other.trigger.message_replied[0]===ownerId&&other.trigger.message_replied[1]===old)other.trigger.message_replied[1]=next;
    if(owner.id===ownerId&&Array.isArray(other?.trigger?.reply_selected)&&other.trigger.reply_selected[0]===old)other.trigger.reply_selected[0]=next;
  });
  P.content.filter(c=>c.type==='quest').forEach(quest=>(quest.stages||[]).forEach(stage=>{
    const completion=stage.completion||stage._authored?.completion;if(!completion)return;
    if(!['text_sent','text_received','text_replied'].includes(completion.event))return;
    if(completion.character&&completion.character!==ownerId)return;
    if(completion.message===old)completion.message=next;if(completion.thread===old)completion.thread=next;
  }));
  P.content.filter(c=>c.type==='quest'&&c.questPlan?.phoneOffer?.messageId===old).forEach(c=>c.questPlan.phoneOffer.messageId=next);
  pbSelectedMessageId=next;return next;
}
function renamePhoneReply(ownerId,message,reply,nextRaw){
  const old=reply.id,next=phoneUniqueReplyId(message,nextRaw,reply);if(old===next)return next;reply.id=next;
  phoneMessages(ownerId).forEach(other=>{
    const selected=other?.trigger?.reply_selected;
    if(Array.isArray(selected)&&selected[0]===message.id&&selected[1]===old)selected[1]=next;
  });
  P.content.filter(c=>c.type==='quest').forEach(quest=>(quest.stages||[]).forEach(stage=>{
    const completion=stage.completion||stage._authored?.completion;if(!completion||completion.event!=='text_replied')return;
    if(completion.character&&completion.character!==ownerId)return;
    if((completion.message===message.id||completion.thread===message.id)&&completion.reply_id===old)completion.reply_id=next;
  }));
  return next;
}

/** Builds or updates the one inbound message managed by Quest Builder. */
function syncQuestPhoneOffer(quest,rawConfig){
  const config=Object.assign({},rawConfig||{}),oldOwner=config.ownerId,ownerId=quest?.character||'';
  if(oldOwner&&oldOwner!==ownerId&&config.messageId)phoneRemoveMessage(oldOwner,config.messageId);
  if(!config.enabled){if(ownerId&&config.messageId)phoneRemoveMessage(ownerId,config.messageId);return Object.assign(config,{ownerId,error:''});}
  if(!phoneOwner(ownerId))return Object.assign(config,{ownerId,error:'Choose a quest giver before saving the phone offer.'});
  if(!String(config.text||'').trim())return Object.assign(config,{ownerId,error:'Write the quest giver’s message before saving.'});
  const messageId=config.messageId&&phoneMessageById(ownerId,config.messageId)?config.messageId:phoneUniqueMessageId(ownerId,ownerId+'_'+quest.id+'_offer');
  const existing=phoneMessageById(ownerId,messageId)||{id:messageId,trigger:{},quick_replies:[],effects:[]};
  ensurePhoneMessageShape(existing,ownerId);existing.direction='incoming';existing.sender=ownerId;existing.text=String(config.text).trim();existing.introduces_contact=true;
  const gates={};Object.entries(existing.trigger||{}).forEach(([key,value])=>{if(!PHONE_TRIGGER_KEYS.includes(key))gates[key]=value;});
  existing.trigger=quest.after?Object.assign(gates,{hours_after_quest:[quest.after,0]}):Object.assign(gates,{sandbox_activated:true});
  let reply=existing.quick_replies.find(item=>item?.id===config.replyId)||existing.quick_replies.find(item=>(item?.effects||[]).some(effect=>effect.operation==='start_quest'&&(effect.quest===quest.id||effect.value===quest.id)));
  if(!reply){reply={id:phoneUniqueReplyId(existing,messageId+'_accept'),text:'',tone:['helpful'],effects:[]};existing.quick_replies.unshift(reply);}
  ensurePhoneReplyShape(reply,existing,existing.quick_replies.indexOf(reply));reply.text=String(config.acceptText||'Sure. What do you need?').trim();
  const first=quest.stages?.find(stage=>stage.id!=='branch'),managedQuests=new Set([quest.id,config.questId].filter(Boolean)),managedObjectives=new Set([first?.id,config.objectiveId].filter(Boolean));
  reply.effects=(reply.effects||[]).filter(effect=>{
    const effectQuest=effect?.quest||effect?.value;
    if(effect?.operation==='start_quest'&&managedQuests.has(effectQuest))return false;
    if(effect?.operation==='complete_objective'&&managedQuests.has(effect?.quest)&&managedObjectives.has(effect?.objective||effect?.value))return false;
    return true;
  });
  reply.effects.unshift({operation:'start_quest',quest:quest.id});
  if(config.completeFirst&&first)reply.effects.push({operation:'complete_objective',quest:quest.id,objective:first.id});
  phoneUpsertMessage(ownerId,existing);
  return Object.assign(config,{messageId:existing.id,replyId:reply.id,ownerId,questId:quest.id,
    objectiveId:config.completeFirst&&first?first.id:'',error:''});
}

const PhoneTextAuthoring={phoneOwners,phoneMessages,phoneAllMessages,phoneDirection,phoneMessageById,phoneUniqueMessageId,
  phoneUniqueReplyId,ensurePhoneMessageShape,makePhoneMessage,phoneUpsertMessage,phoneRemoveMessage,phoneMessageTriggerKind,
  phoneTriggerSummary,phoneEffectDefault,phoneConditionDefault,renamePhoneMessage,renamePhoneReply,syncQuestPhoneOffer,openPhoneBuilder};
if(typeof globalThis!=='undefined')globalThis.PhoneTextAuthoring=PhoneTextAuthoring;

// Keep the Content-rail count fresh after imports, project loads, and ordinary edits
// without coupling the rail module to phone authoring.
if(typeof paintContent==='function'){
  const paintContentBeforePhone=paintContent;
  paintContent=function(){const result=paintContentBeforePhone.apply(this,arguments);paintTextMessageSummary();return result;};
}

if(typeof document!=='undefined'&&typeof document.querySelectorAll==='function'&&$('openPhoneBuilder')){
  $('openPhoneBuilder').onclick=()=>openPhoneBuilder();$('openPhoneBuilderRail').onclick=()=>openPhoneBuilder();$('manageTextMessages').onclick=()=>openPhoneBuilder();$('closePhoneBuilder').onclick=()=>$('phoneBuilder').close();
  $('pbNewBlank').onclick=()=>addPhoneMessageFromTemplate('blank');document.querySelectorAll('[data-pb-template]').forEach(button=>button.onclick=()=>addPhoneMessageFromTemplate(button.dataset.pbTemplate));
  $('pbMessageId').onchange=event=>{const message=phoneMessageById(pbOwnerId,pbSelectedMessageId);if(!message)return;event.target.value=renamePhoneMessage(pbOwnerId,message,event.target.value);phonePersist(true);paintPhoneMessages();};
  $('pbText').oninput=event=>{const message=phoneMessageById(pbOwnerId,pbSelectedMessageId);if(!message)return;message.text=event.target.value;paintPhonePreview(message);phonePersist();paintPhoneMessages();};
  $('pbDirection').onchange=event=>{
    const message=phoneMessageById(pbOwnerId,pbSelectedMessageId);if(!message)return;
    const previous=phoneDirection(message,pbOwnerId),next=event.target.value;
    const removesReplies=next==='outgoing'&&(message.quick_replies||[]).length;
    const removesEffects=next==='incoming'&&(message.effects||[]).length;
    if((removesReplies||removesEffects)&&typeof confirm==='function'&&!confirm(
      removesReplies?'Changing this to a player-sent text removes its quick replies. Continue?':
        'Changing this to an NPC text removes its send effects. Continue?')){
      event.target.value=previous;return;
    }
    message.direction=next;message.sender=next==='outgoing'?'player':pbOwnerId;
    if(next==='outgoing'){
      message.quick_replies=[];message.effects=Array.isArray(message.effects)?message.effects:[];
      delete message.introduces_contact;
    }else{
      delete message.effects;
    }
    phonePersist(true);paintPhoneMessages();paintPhoneEditor();
  };
  $('pbIntroduces').onchange=event=>{const message=phoneMessageById(pbOwnerId,pbSelectedMessageId);if(!message)return;event.target.checked?message.introduces_contact=true:delete message.introduces_contact;phonePersist();};
  const triggerChanged=section=>{const message=phoneMessageById(pbOwnerId,pbSelectedMessageId);if(!message)return;readPhoneTrigger(message,section);phonePersist();paintPhoneMessages();};
  const triggerFields={pbTriggerDetail:'event',pbDay:'day',pbBlock:'block',pbFlagGate:'flag',pbFlagMode:'flag',pbMeterGate:'meter',pbMeterOp:'meter',pbMeterValue:'meter'};
  Object.entries(triggerFields).forEach(([id,section])=>{const element=$(id);element.oninput=()=>triggerChanged(section);element.onchange=()=>triggerChanged(section);});
  $('pbTriggerRef').onchange=()=>{triggerChanged('event');const message=phoneMessageById(pbOwnerId,pbSelectedMessageId);if(message)paintPhoneTrigger(message);};
  $('pbTriggerType').onchange=()=>{const message=phoneMessageById(pbOwnerId,pbSelectedMessageId);if(!message)return;readPhoneTrigger(message,'event');paintPhoneTrigger(message);phonePersist();paintPhoneMessages();};
  $('pbAddReply').onclick=()=>{const message=phoneMessageById(pbOwnerId,pbSelectedMessageId);if(!message)return;const reply=ensurePhoneReplyShape({text:'',tone:[],effects:[]},message,message.quick_replies.length);message.quick_replies.push(reply);paintPhoneReplies(message);phonePersist();};
  $('pbAddOutgoingEffect').onclick=()=>{const message=phoneMessageById(pbOwnerId,pbSelectedMessageId);if(!message)return;message.effects.push(phoneEffectDefault('add_meter',pbOwnerId));paintPhoneEffects($('pbOutgoingEffects'),message.effects,pbOwnerId);phonePersist();};
  $('pbAddCondition').onclick=()=>{const message=phoneMessageById(pbOwnerId,pbSelectedMessageId);if(!message)return;if(!Array.isArray(message.conditions))message.conditions=[];message.conditions.push(phoneConditionDefault('meter_at_least',pbOwnerId));paintPhoneConditions($('pbConditions'),message.conditions,pbOwnerId);phonePersist();};
  $('pbDuplicate').onclick=()=>{const source=phoneMessageById(pbOwnerId,pbSelectedMessageId);if(!source)return;const copy=phoneClone(source);copy.id=phoneUniqueMessageId(pbOwnerId,source.id+'_copy');(copy.quick_replies||[]).forEach((reply,index)=>reply.id=phoneUniqueReplyId(copy,copy.id+'_reply_'+(index+1),reply));phoneMessages(pbOwnerId).push(copy);pbSelectedMessageId=copy.id;phonePersist();paintPhoneBuilder();};
  $('pbDelete').onclick=()=>{const message=phoneMessageById(pbOwnerId,pbSelectedMessageId);if(!message)return;if(typeof confirm==='function'&&!confirm('Delete this authored text message?'))return;phoneRemoveMessage(pbOwnerId,message.id);pbSelectedMessageId=phoneMessages(pbOwnerId)[0]?.id||'';phonePersist();paintPhoneBuilder();};
  paintTextMessageSummary();
}
