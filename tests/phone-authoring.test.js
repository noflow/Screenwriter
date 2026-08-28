const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const siblingGameRoot=path.resolve(root,'..','testgodot');
const gameRoot=process.env.SCENEWRIGHT_GAME_ROOT||siblingGameRoot;
const elements = new Proxy({}, {get(target, id) {
  if (!target[id]) target[id] = {checked: id === 'writePlayer', value: '', innerHTML: ''};
  return target[id];
}});
const context = vm.createContext({
  console,
  document: {getElementById: id => elements[id]},
});
const load = file => vm.runInContext(
  fs.readFileSync(path.join(root, file), 'utf8'), context, {filename:file});

load('js/00-state.js');
load('js/01a-game-characters.js');
vm.runInContext(`
  var DISTRICTS=[],TRAVEL=null,ALIASES={};
  function customStatDefs(){ return []; }
  function statDefinition(){ return null; }
  function locPart(ref){ return String(ref||'').split('.')[0]; }
  function roomPart(ref){ return String(ref||'').split('.').slice(1).join('.'); }
  function roomOf(ref){
    const place=loc(locPart(ref));return place?.rooms?.find(room=>room.id===roomPart(ref))||null;
  }
  function contentAvailability(){ return []; }
  function placeName(ref){ return ref; }
  function countLines(list){
    return (list||[]).reduce((total,node)=>total+(node.type==='line'?1:
      (node.options||[]).reduce((sum,option)=>sum+countLines(option.nodes),0)),0);
  }
  function gameReady(character){ return JSON.parse(JSON.stringify(character)); }
  function links(){ return []; }
`, context);
load('js/12-conditions.js');
load('js/15-registry.js');
load('js/15f-contract.js');
load('js/15b-validate.js');
load('js/18-authored-out.js');
load('js/08j-phone-builder.js');

const characterDirectory=path.join(gameRoot,'characters');
const sheets=fs.existsSync(characterDirectory)
  ?fs.readdirSync(characterDirectory).filter(name=>name.endsWith('.character'))
    .map(name=>JSON.parse(fs.readFileSync(path.join(characterDirectory,name),'utf8')))
  :JSON.parse(vm.runInContext('JSON.stringify(BUNDLED_CHARACTER_SHEETS)',context));
context.SHEETS = sheets;

vm.runInContext(`
  P={characters:SHEETS.map(sheet=>Object.assign({},sheet,{name:sheet.display_name})),
    locations:[],content:[],districts:[],travel:null,aliases:{}};
  globalThis.REAL_MESSAGE_COUNT=allTextMessages().length;
  globalThis.REAL_MESSAGE_OWNERS=allTextMessages().map(entry=>entry.owner.id).sort();
  globalThis.REAL_ROUND_TRIPS=P.characters.filter(character=>character.text_messages?.length).map(character=>({
    id:character.id,
    source:character.text_messages,
    exported:sheetOut(character).text_messages
  }));

  const emma=P.characters.find(character=>character.id==='emma_rowan');
  P.characters=[emma];
  const quest={uid:'phone-quest',type:'quest',id:'phone_help',title:'Phone Help',character:emma.id,
    location:'',day:'monday',block:'evening',cast:[emma.id],requires:[],stages:[
      {id:'answer_emma',title:'Answer Emma',location:'',nodes:[],flag:'',requires:[],
        completion:{event:'text_replied',thread:'emma_phone_offer'}},
      {id:'send_update',title:'Send an update',location:'',nodes:[],flag:'',requires:[],
        completion:{event:'text_sent',character:emma.id,message:'player_update'}}
    ],questPlan:{phoneOfferMessageId:'emma_phone_offer'}};
  P.content=[quest];
  emma.text_messages=[
    {id:'emma_phone_offer',direction:'incoming',sender:emma.id,
      trigger:{sandbox_activated:true,days:['friday'],blocks:['evening']},
      conditions:[{meter_at_least:[emma.id,'trust',50]}],text:'Can you help me tonight?',
      quick_replies:[{id:'accept',text:'Yes, I can help.',tone:['supportive'],effects:[
        {operation:'start_quest',quest:quest.id},
        {operation:'add_meter',character:emma.id,meter:'trust',value:2}
      ]}]},
    {id:'player_update',direction:'outgoing',sender:'player',trigger:{quest_started:quest.id},
      text:'I found what you needed.',effects:[
        {operation:'complete_objective',quest:quest.id,objective:'send_update'},
        {operation:'complete_quest',value:quest.id}
      ]},
    {id:'emma_update_reply',direction:'incoming',sender:emma.id,
      trigger:{message_sent:'player_update'},text:'Thank you. That means a lot.',quick_replies:[]},
    {id:'emma_accept_followup',direction:'incoming',sender:emma.id,
      trigger:{reply_selected:['emma_phone_offer','accept']},text:'I knew I could count on you.',quick_replies:[]},
    {id:'player_checkin',direction:'outgoing',sender:'player',trigger:{},
      text:'Hey, how are you?',effects:[]}
  ];
  const legacyOffer={id:'legacy_offer',sender:emma.id,trigger:{sandbox_activated:true},
    text:'Legacy reply probe',quick_replies:[{text:'Yes'}]};
  emma.text_messages.push(legacyOffer,{id:'legacy_followup',sender:emma.id,
    trigger:{reply_selected:['legacy_offer','reply_0']},text:'Legacy follow-up',quick_replies:[]});
  globalThis.AUTHORED_ERRORS=validate().filter(issue=>issue.sev==='err').map(issue=>issue.msg);
  PhoneTextAuthoring.ensurePhoneMessageShape(legacyOffer,emma.id);
  globalThis.LEGACY_REPLY_ID=legacyOffer.quick_replies[0].id;
  globalThis.LEGACY_TRIGGER=emma.text_messages.at(-1).trigger.reply_selected;
  globalThis.EXPORTED_MESSAGES=sheetOut(emma).text_messages;
  emma.text_messages[0]._quest_id=quest.id;
  globalThis.CLEAN_MESSAGE=phoneMessageOut(emma.text_messages[0]);
  globalThis.RENAMED_MESSAGE=renameTextMessageId(emma,emma.text_messages[1],'player_progress_update');
  globalThis.RENAMED_TRIGGER=emma.text_messages[2].trigger.message_sent;
  globalThis.RENAMED_OBJECTIVE=quest.stages[1].completion.message;
  renameTextMessageId(emma,emma.text_messages[0],'emma_help_offer');
  globalThis.RENAMED_REPLY_TRIGGER=emma.text_messages[3].trigger.reply_selected;
  globalThis.RENAMED_REPLY_OBJECTIVE=quest.stages[0].completion.thread;
  globalThis.RENAMED_PHONE_PLAN=quest.questPlan.phoneOfferMessageId;
  renameContentId(quest,'phone_help_revised');
  globalThis.RENAMED_QUEST_REFS={
    outbound:emma.text_messages[1].trigger.quest_started,
    start:emma.text_messages[0].quick_replies[0].effects[0].quest,
    complete:emma.text_messages[1].effects[0].quest,
    completeAlias:emma.text_messages[1].effects[1].value
  };

  emma.text_messages.push({id:'emma_help_offer',direction:'outgoing',sender:emma.id,
    trigger:{sandbox_activated:true},text:'Broken duplicate'});
  globalThis.BROKEN_ERRORS=validate().filter(issue=>issue.sev==='err').map(issue=>issue.msg);
  emma.text_messages.pop();

  const daniel=Object.assign({},SHEETS.find(character=>character.id==='daniel_hale'),
    {name:'Daniel Hale',text_messages:[{id:'shared_text',direction:'outgoing',sender:'player',
      trigger:{},text:'Shared id probe',effects:[]}]});
  P.characters.push(daniel);
  globalThis.GLOBAL_UNIQUE_ID=PhoneTextAuthoring.phoneUniqueMessageId(emma.id,'shared_text');
  const collision=PhoneTextAuthoring.phoneUpsertMessage(emma.id,{id:'shared_text',direction:'outgoing',
    sender:'player',trigger:{},text:'Collision probe',effects:[]});
  globalThis.UPSERTED_GLOBAL_ID=collision.id;
  const playerText=PhoneTextAuthoring.makePhoneMessage(emma.id,'player_text');
  globalThis.PLAYER_TEXT_SHAPE={direction:playerText.direction,sender:playerText.sender,
    trigger:playerText.trigger,replies:playerText.quick_replies};
  globalThis.DEFAULT_PHONE_CONDITION=PhoneTextAuthoring.phoneConditionDefault('meter_at_least',emma.id);

  emma.text_messages.push({id:'array_source',direction:'outgoing',sender:'player',trigger:{},
    text:'Array reference source',effects:[]});
  daniel.text_messages.push({id:'cross_contact_followup',direction:'incoming',sender:daniel.id,
    trigger:{message_sent:[emma.id,'array_source']},text:'Cross-contact follow-up',quick_replies:[]});
  renameTextMessageId(emma,textMessageById('array_source').message,'array_source_renamed');
  globalThis.RENAMED_ARRAY_TRIGGER=daniel.text_messages[1].trigger.message_sent;

  const phoneQuest={uid:'phone-builder-quest',type:'quest',id:'builder_phone_quest',title:'Builder Phone Quest',
    character:emma.id,location:'',day:'',block:'',cast:[emma.id],requires:[],stages:[
      {id:'answer_offer',title:'Answer the offer',location:'',nodes:[],flag:'',requires:[]}
    ],questPlan:{}};
  P.content.push(phoneQuest);
  const offer=PhoneTextAuthoring.syncQuestPhoneOffer(phoneQuest,{enabled:true,
    text:'Could you help me with a phone quest?',acceptText:'Yes, tell me more.',completeFirst:true});
  const offerMessage=textMessageById(offer.messageId).message;
  globalThis.QUEST_OFFER_SHAPE={owner:offer.ownerId,direction:offerMessage.direction,
    introduces:offerMessage.introduces_contact,trigger:offerMessage.trigger,
    hasTopLevelEffects:Object.prototype.hasOwnProperty.call(offerMessage,'effects'),
    effects:offerMessage.quick_replies.find(reply=>reply.id===offer.replyId).effects};
  daniel.text_messages.push({id:'bad_cross_thread',direction:'incoming',sender:daniel.id,
    trigger:{message_sent:'player_checkin'},text:'This uses the wrong thread.',quick_replies:[]});
  emma.text_messages.push({id:'bad_condition_shape',direction:'outgoing',sender:'player',trigger:{},
    conditions:{flag:'phone.bad_shape'},text:'Bad condition shape',effects:[]});
  const rachel=Object.assign({},SHEETS.find(character=>character.id==='rachel_morgan'),{
    name:'Rachel Morgan',encounter:null,text_messages:[
      {id:'rachel_locked_send',direction:'outgoing',sender:'player',trigger:{},text:'Can I text you?',effects:[]},
      {id:'rachel_impossible_intro',direction:'incoming',sender:'rachel_morgan',introduces_contact:true,
        trigger:{message_sent:'rachel_locked_send'},text:'This cannot arrive first.',quick_replies:[]}
    ]
  });
  P.characters.push(rachel);
  globalThis.ALIGNMENT_ERRORS=validate().filter(issue=>issue.sev==='err').map(issue=>issue.msg);
`, context);

assert.equal(context.REAL_MESSAGE_COUNT, 10);
assert.deepEqual(Array.from(context.REAL_MESSAGE_OWNERS), [
  'daniel_hale','elena_reyes_hale','elena_reyes_hale','emma_rowan','emma_rowan',
  'lily_hale','lily_hale','marcus_lee','marcus_lee','rachel_morgan'
]);
for (const row of context.REAL_ROUND_TRIPS) {
  assert.deepEqual(JSON.parse(JSON.stringify(row.exported)), JSON.parse(JSON.stringify(row.source)),
    `${row.id} phone messages must round-trip exactly`);
}
assert.deepEqual(Array.from(context.AUTHORED_ERRORS), []);
assert.equal(context.EXPORTED_MESSAGES[0].direction, 'incoming');
assert.equal(context.EXPORTED_MESSAGES[1].direction, 'outgoing');
assert.equal(context.EXPORTED_MESSAGES[0].quick_replies[0].effects[0].operation, 'start_quest');
assert.equal(context.CLEAN_MESSAGE._quest_id, undefined);
assert.equal(context.RENAMED_MESSAGE, 'player_progress_update');
assert.equal(context.RENAMED_TRIGGER, 'player_progress_update');
assert.equal(context.RENAMED_OBJECTIVE, 'player_progress_update');
assert.deepEqual(Array.from(context.RENAMED_REPLY_TRIGGER), ['emma_help_offer','accept']);
assert.equal(context.RENAMED_REPLY_OBJECTIVE, 'emma_help_offer');
assert.equal(context.RENAMED_PHONE_PLAN, 'emma_help_offer');
assert.deepEqual(JSON.parse(JSON.stringify(context.RENAMED_QUEST_REFS)), {
  outbound:'phone_help_revised',start:'phone_help_revised',complete:'phone_help_revised',
  completeAlias:'phone_help_revised'
});
assert.equal(context.LEGACY_REPLY_ID, 'reply_0');
assert.deepEqual(Array.from(context.LEGACY_TRIGGER), ['legacy_offer','reply_0']);
assert(context.BROKEN_ERRORS.some(message => message.includes('also used')));
assert(context.BROKEN_ERRORS.some(message => message.includes('Outgoing messages must be sent')));
assert.equal(context.GLOBAL_UNIQUE_ID, 'shared_text_2');
assert.equal(context.UPSERTED_GLOBAL_ID, 'shared_text_2');
assert.deepEqual(JSON.parse(JSON.stringify(context.PLAYER_TEXT_SHAPE)), {
  direction:'outgoing',sender:'player',trigger:{},replies:[]
});
assert.deepEqual(JSON.parse(JSON.stringify(context.DEFAULT_PHONE_CONDITION)), {
  meter_at_least:['emma_rowan','trust',50]
});
assert.deepEqual(Array.from(context.RENAMED_ARRAY_TRIGGER), ['emma_rowan','array_source_renamed']);
assert.equal(context.QUEST_OFFER_SHAPE.owner, 'emma_rowan');
assert.equal(context.QUEST_OFFER_SHAPE.direction, 'incoming');
assert.equal(context.QUEST_OFFER_SHAPE.introduces, true);
assert.equal(context.QUEST_OFFER_SHAPE.hasTopLevelEffects, false);
assert.deepEqual(JSON.parse(JSON.stringify(context.QUEST_OFFER_SHAPE.trigger)), {sandbox_activated:true});
assert.deepEqual(JSON.parse(JSON.stringify(context.QUEST_OFFER_SHAPE.effects)), [
  {operation:'start_quest',quest:'builder_phone_quest'},
  {operation:'complete_objective',quest:'builder_phone_quest',objective:'answer_offer'}
]);
assert(context.ALIGNMENT_ERRORS.some(message => message.includes('cross-contact message_sent')));
assert(context.ALIGNMENT_ERRORS.some(message => message.includes('conditions must be a list')));
assert(context.ALIGNMENT_ERRORS.some(message => message.includes('same undiscovered thread')));

console.log('phone authoring regression tests passed');
