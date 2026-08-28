/* ---- validator ---- */
const lev=(a,b)=>{
  const m=[];for(let i=0;i<=b.length;i++)m[i]=[i];
  for(let j=0;j<=a.length;j++)m[0][j]=j;
  for(let i=1;i<=b.length;i++)for(let j=1;j<=a.length;j++)
    m[i][j]=b[i-1]===a[j-1]?m[i-1][j-1]:Math.min(m[i-1][j-1],m[i][j-1],m[i-1][j])+1;
  return m[b.length][a.length];
};

function validatePhoneAuthoring(add){
  const seen=new Map(),entries=allTextMessages();
  const quests=new Map(P.content.filter(c=>c.type==='quest').map(c=>[c.id,c]));
  const eventKeys=['sandbox_activated','quest_started','objective_completed',
    'hours_after_quest','hours_before_calendar_event','message_sent','message_replied','reply_selected'];
  const triggerKeys=new Set([...eventKeys,'days','blocks','flag','flag_not','meter_at_least','meter_at_most']);
  const meters=new Set(['friendship','love','attraction','lust','trust','respect','resentment',
    'jealousy','comfort','commitment','compatibility','satisfaction']);
  const metricKnown=key=>meters.has(key);
  const conditionList=(raw,where)=>{
    if(raw===undefined)return [];
    if(Array.isArray(raw))return raw;
    if(raw&&typeof raw==='object'){
      add('err','Phone conditions must be a list of gates.',where);return [raw];
    }
    add('err','Phone conditions must be a list of gates.',where);return [];
  };
  const conditionCheck=(rule,where,owner)=>{
    if(!rule||typeof rule!=='object')return add('err','A phone condition is malformed.',where);
    if(Object.keys(rule).length!==1)return add('err','Each phone condition must contain one gate.',where);
    const stat=rule.meter_at_least||rule.meter_at_most;
    if(stat){
      if(!Array.isArray(stat)||![2,3].includes(stat.length))return add('err','A phone meter condition needs a meter, value, and optional character.',where);
      const character=stat.length===2?owner.id:stat[0],meter=stat.at(-2),value=stat.at(-1);
      if(!authoredChr(character))add('err','Phone condition refers to missing character "'+character+'".',where);
      if(!metricKnown(meter))add('err','Phone condition uses unknown meter "'+meter+'".',where);
      if(!Number.isFinite(+value))add('err','Phone condition meter value must be a number.',where);
      return;
    }
    const flag=rule.flag||rule.flag_not;
    if(flag){
      if(!(typeof flag==='string'&&flag.trim())&&
         !(Array.isArray(flag)&&flag.length===2&&String(flag[0]||'').trim()))
        add('err','A phone flag condition needs a flag key.',where);
      return;
    }
    if(rule.value_equals){
      if(!Array.isArray(rule.value_equals)||rule.value_equals.length!==2||!String(rule.value_equals[0]||'').trim())
        add('err','A phone value condition needs a state key and expected value.',where);
      return;
    }
    add('err','Phone condition uses an unsupported rule.',where);
  };
  const questRef=(effect)=>String(effect.quest||
    (['start_quest','complete_quest'].includes(effect.operation)?effect.value||'':'')||'');
  const effectCheck=(effect,where,strict=true,owner=null)=>{
    if(!effect||typeof effect!=='object')return add('err','A phone effect is malformed.',where);
    const operation=String(effect.operation||'');
    const supported=['add_meter','start_quest','complete_objective','complete_quest','set_quest_state',
      'set_flag','set_value','open_calendar_scheduler','open_calendar_rescheduler'];
    if(!supported.includes(operation))return add('err','Phone effect "'+(operation||'?')+'" is not supported by the game.',where);
    if(operation==='add_meter'){
      const character=effect.character||owner?.id;
      if(!authoredChr(character))add('err','Phone reward refers to missing character "'+character+'".',where);
      if(!metricKnown(effect.meter))add('err','Phone reward uses unknown meter "'+effect.meter+'".',where);
      if(!Number.isFinite(+effect.value))add('err','Phone reward amount must be a number.',where);
    }
    if(['start_quest','complete_objective','complete_quest','set_quest_state'].includes(operation)){
      const questId=questRef(effect),quest=quests.get(questId);
      if(!quest)add(strict?'err':'warn','Phone effect refers to quest "'+questId+
        '", which is not loaded in this Screenwriter project.',where);
      const objective=effect.objective||effect.value;
      if(operation==='complete_objective'&&quest&&!(quest.stages||[]).some(s=>s.id===objective))
        add('err','Phone effect refers to missing objective "'+objective+'" in '+questId+'.',where);
      if(operation==='set_quest_state'&&!['deferred','failed'].includes(effect.value))
        add('err','Phone quest state must be deferred or failed.',where);
    }
    if(operation==='set_flag'&&!String(effect.key||'').trim())add('err','Phone flag effect needs a flag key.',where);
    if(operation==='set_value'&&!String(effect.key||'').trim())add('err','Phone value effect needs a state key.',where);
    if(operation==='open_calendar_scheduler'&&effect.participant&&!authoredChr(effect.participant))
      add('err','Phone scheduler refers to missing character "'+effect.participant+'".',where);
    if(operation==='open_calendar_scheduler'&&effect.valid_quest&&!quests.has(effect.valid_quest))
      add(strict?'err':'warn','Phone scheduler refers to quest "'+effect.valid_quest+
        '", which is not loaded in this Screenwriter project.',where);
    if(operation==='open_calendar_rescheduler'&&!String(effect.event||effect.value||'').trim())
      add('err','Phone rescheduler effect needs a calendar event id.',where);
  };

  entries.forEach(({owner,message})=>{
    const where='Text · '+owner.name+' · '+(message.id||'untitled'),id=String(message.id||'');
    const strict=Object.prototype.hasOwnProperty.call(message,'direction');
    if(!id)add('err','A phone message has no id.',where);
    else if(slug(id)!==id)add('err','Phone message id "'+id+'" must use lowercase words joined by underscores.',where);
    if(id.startsWith('reply-'))add('err','Phone message ids cannot start with "reply-"; the runtime reserves that prefix.',where);
    if(id&&seen.has(id))add('err','Phone message id "'+id+'" is also used by '+seen.get(id)+'. Message ids must be unique across every contact.',where);
    if(id)seen.set(id,owner.name);
    const direction=textMessageDirection(message);
    if(!['incoming','outgoing'].includes(direction))add('err','Phone message direction must be incoming or outgoing.',where);
    if(direction==='incoming'&&message.sender&&message.sender!==owner.id)
      add('err','Incoming sender must be the owning contact "'+owner.id+'".',where);
    if(direction==='outgoing'&&message.sender!=='player')add('err','Outgoing messages must be sent by the runtime Player.',where);
    if(!String(message.text||'').trim())add('err','Phone message text is empty.',where);
    if(direction==='outgoing'&&message.introduces_contact)add('err','Only an incoming message can introduce a new phone contact.',where);
    const trigger=message.trigger&&typeof message.trigger==='object'&&!Array.isArray(message.trigger)?message.trigger:{};
    if(trigger!==message.trigger)add('err','Phone message trigger must be an object.',where);
    Object.keys(trigger).filter(key=>!triggerKeys.has(key)).forEach(key=>
      add('err','Phone message uses unsupported trigger "'+key+'".',where));
    const active=eventKeys.filter(key=>Object.prototype.hasOwnProperty.call(trigger,key));
    if(direction==='incoming'&&active.length!==1)
      add('err','An incoming phone message needs exactly one arrival trigger.',where);
    if(direction==='outgoing'&&active.length>1)
      add('err','An outgoing phone message can have only one availability trigger.',where);
    if(Object.prototype.hasOwnProperty.call(trigger,'sandbox_activated')&&typeof trigger.sandbox_activated!=='boolean')
      add('err','Sandbox arrival trigger must be true or false.',where);
    if(Object.prototype.hasOwnProperty.call(trigger,'quest_started')){
      if(!String(trigger.quest_started||'').trim())add('err','Quest-started trigger needs a quest.',where);
      else if(!quests.has(trigger.quest_started))add(strict?'err':'warn',
        'Phone trigger refers to quest "'+trigger.quest_started+'", which is not loaded in this Screenwriter project.',where);
    }
    if(trigger.objective_completed){
      const ref=trigger.objective_completed,quest=Array.isArray(ref)?quests.get(ref[0]):null;
      if(!quest)add(strict?'err':'warn','Phone objective trigger refers to a quest that is not loaded in this Screenwriter project.',where);
      else if(ref.length!==2||!(quest.stages||[]).some(s=>s.id===ref[1]))add('err','Phone objective trigger refers to a missing objective.',where);
    }
    if(trigger.hours_after_quest){
      const ref=trigger.hours_after_quest;
      if(!Array.isArray(ref)||ref.length!==2||+ref[1]<0)
        add('err','Hours-after-quest trigger needs a quest id and a nonnegative hour count.',where);
      else if(!quests.has(ref[0]))add(strict?'err':'warn','Hours-after-quest trigger refers to quest "'+
        ref[0]+'", which is not loaded in this Screenwriter project.',where);
    }
    if(trigger.hours_before_calendar_event){
      const ref=trigger.hours_before_calendar_event;
      if(!Array.isArray(ref)||ref.length!==2||!String(ref[0]||'').trim()||+ref[1]<0)
        add('err','Calendar reminder trigger needs an event id and nonnegative hour count.',where);
    }
    if(trigger.message_sent){
      const sourceId=Array.isArray(trigger.message_sent)?trigger.message_sent[1]:trigger.message_sent;
      const source=entries.find(entry=>entry.message.id===sourceId);
      if(!source)add('err','Phone follow-up waits for missing message "'+sourceId+'".',where);
      else if(textMessageDirection(source.message)!=='outgoing')add('err','message_sent must point to a player-to-NPC text.',where);
      else if(!Array.isArray(trigger.message_sent)&&source.owner.id!==owner.id)
        add('err','A cross-contact message_sent trigger must include the contact and message id.',where);
      else if(Array.isArray(trigger.message_sent)&&trigger.message_sent[0]!==source.owner.id)
        add('err','message_sent names the wrong contact for "'+sourceId+'".',where);
    }
    if(trigger.message_replied){
      const sourceId=Array.isArray(trigger.message_replied)?trigger.message_replied[1]:trigger.message_replied;
      const source=entries.find(entry=>entry.message.id===sourceId);
      if(!source)add('err','Phone follow-up waits for missing message "'+sourceId+'".',where);
      else if(textMessageDirection(source.message)!=='incoming')add('err','message_replied must point to an NPC-to-player text.',where);
      else if(!Array.isArray(trigger.message_replied)&&source.owner.id!==owner.id)
        add('err','A cross-contact message_replied trigger must include the contact and message id.',where);
      else if(Array.isArray(trigger.message_replied)&&trigger.message_replied[0]!==source.owner.id)
        add('err','message_replied names the wrong contact for "'+sourceId+'".',where);
    }
    if(trigger.reply_selected){
      const ref=trigger.reply_selected,source=Array.isArray(ref)?entries.find(entry=>entry.message.id===ref[0]):null;
      if(!source||ref.length!==2)add('err','Specific-reply trigger needs an incoming message id and reply id.',where);
      else if(textMessageDirection(source.message)!=='incoming')add('err','reply_selected must point to an NPC-to-player text.',where);
      else if(source.owner.id!==owner.id)add('err','reply_selected must point to a message in the same contact thread.',where);
      else if(!(source.message.quick_replies||[]).some((reply,index)=>(reply.id||'reply_'+index)===ref[1]))
        add('err','Specific-reply trigger refers to missing reply "'+ref[1]+'".',where);
    }
    const days=trigger.days===undefined?[]:(Array.isArray(trigger.days)?trigger.days:[trigger.days]);
    const blocks=trigger.blocks===undefined?[]:(Array.isArray(trigger.blocks)?trigger.blocks:[trigger.blocks]);
    if(trigger.days!==undefined&&(!days.length||days.some(day=>!DAYS.includes(day))))add('err','Phone trigger contains an unknown weekday.',where);
    if(trigger.blocks!==undefined&&(!blocks.length||blocks.some(block=>!BLOCKS.includes(block))))add('err','Phone trigger contains an unknown time block.',where);
    const triggerRules=[];
    if(trigger.flag)triggerRules.push({flag:trigger.flag});
    if(trigger.flag_not)triggerRules.push({flag_not:trigger.flag_not});
    if(trigger.meter_at_least)triggerRules.push({meter_at_least:trigger.meter_at_least.length===2?
      [owner.id,...trigger.meter_at_least]:trigger.meter_at_least});
    if(trigger.meter_at_most)triggerRules.push({meter_at_most:trigger.meter_at_most.length===2?
      [owner.id,...trigger.meter_at_most]:trigger.meter_at_most});
    [...triggerRules,...conditionList(message.conditions,where)].forEach(rule=>conditionCheck(rule,where,owner));
    if(message.effects!==undefined&&!Array.isArray(message.effects))add('err','Phone message effects must be a list.',where);
    if(direction==='incoming'&&Object.prototype.hasOwnProperty.call(message,'effects'))
      add('err','Incoming phone effects belong on a player reply, not on the incoming message.',where);
    (Array.isArray(message.effects)?message.effects:[]).forEach(effect=>effectCheck(effect,where,strict,owner));
    if(message.quick_replies!==undefined&&!Array.isArray(message.quick_replies))
      add('err','Phone quick replies must be a list.',where);
    if(direction==='outgoing'&&Array.isArray(message.quick_replies)&&message.quick_replies.length)
      add('err','Player-to-NPC texts cannot contain quick replies.',where);
    const replyIds=new Set();
    (Array.isArray(message.quick_replies)?message.quick_replies:[]).forEach((reply,index)=>{
      const replyWhere=where+' · reply '+(index+1);
      if(!String(reply?.text||'').trim())add('err','A phone reply has no text.',replyWhere);
      if(!reply?.id&&strict)add('err','New phone replies need a stable reply id.',replyWhere);
      if(reply?.id){
        if(slug(reply.id)!==reply.id)add('err','Phone reply id "'+reply.id+'" must use lowercase words joined by underscores.',replyWhere);
        if(replyIds.has(reply.id))add('err','Two replies share id "'+reply.id+'" in this message.',replyWhere);
        replyIds.add(reply.id);
      }
      if(reply?.tone!==undefined&&!Array.isArray(reply.tone))add('err','Phone reply tone must be a list.',replyWhere);
      conditionList(reply?.conditions,replyWhere).forEach(rule=>conditionCheck(rule,replyWhere,owner));
      if(reply?.effects!==undefined&&!Array.isArray(reply.effects))add('err','Phone reply effects must be a list.',replyWhere);
      (Array.isArray(reply?.effects)?reply.effects:[]).forEach(effect=>effectCheck(effect,replyWhere,strict,owner));
    });
  });
  // A contact-introducing text cannot depend on activity inside the same
  // undiscovered thread. Cross-contact phone events are reachable once their
  // source contact is reachable, so resolve those chains to a fixed point.
  const reachableContacts=new Set(INITIAL_PHONE_CONTACTS);
  // A discoverable acquaintance can exchange numbers after the introduction;
  // their queued messages remain valid until the player accepts that exchange.
  npcs().filter(owner=>owner.encounter?.contact_policy==='after_introduction')
    .forEach(owner=>reachableContacts.add(owner.id));
  const introductionSourceOwner=(owner,message)=>{
    if(textMessageDirection(message)!=='incoming'||message.introduces_contact!==true)return null;
    const trigger=message.trigger||{};
    if(trigger.reply_selected)return owner.id;
    for(const key of ['message_sent','message_replied']){
      if(!Object.prototype.hasOwnProperty.call(trigger,key))continue;
      const ref=trigger[key];
      return Array.isArray(ref)?ref[0]:owner.id;
    }
    return '';
  };
  let changed=true;
  while(changed){
    changed=false;
    npcs().forEach(owner=>{
      if(reachableContacts.has(owner.id))return;
      const canIntroduce=(owner.text_messages||[]).some(message=>{
        const sourceOwner=introductionSourceOwner(owner,message);
        return sourceOwner!==null&&(sourceOwner===''||sourceOwner!==owner.id&&reachableContacts.has(sourceOwner));
      });
      if(canIntroduce){reachableContacts.add(owner.id);changed=true;}
    });
  }
  npcs().forEach(owner=>{
    if(!(owner.text_messages||[]).length||reachableContacts.has(owner.id))return;
    const sameThreadIntro=(owner.text_messages||[]).some(message=>introductionSourceOwner(owner,message)===owner.id);
    add('err',sameThreadIntro?
      owner.name+' cannot be introduced by a text that waits for activity in the same undiscovered thread.':
      owner.name+' has authored texts but no reachable incoming text introduces this contact.',
      'Phone contacts');
  });
  return new Map(entries.filter(entry=>entry.message.id).map(entry=>[entry.message.id,entry]));
}

function validate(){
  const out=[],add=(sev,msg,where,fix)=>out.push({sev,msg,where,fix});
  const districts=typeof DISTRICTS==='undefined'?(P.districts||[]):DISTRICTS;
  const ids=new Set(),cids=new Set(),chapterArcIds=new Map(),characterStoryArcIds=new Map();
  const impossibleStats=reqs=>{
    const limits={};
    (reqs||[]).filter(r=>r.type==='stat').forEach(r=>{
      const key=r.character+'.'+r.key,box=limits[key]||(limits[key]={min:-Infinity,max:Infinity});
      const v=+r.value;
      if(r.op==='gte')box.min=Math.max(box.min,v);
      if(r.op==='lte')box.max=Math.min(box.max,v);
      if(r.op==='eq'){box.min=Math.max(box.min,v);box.max=Math.min(box.max,v);}
    });
    return Object.entries(limits).find(([,box])=>box.min>box.max);
  };

  P.characters.forEach(c=>{
    if(cids.has(c.id))add('err','Two characters share the id "'+c.id+'".','Cast');
    cids.add(c.id);
    if(isPlayer(c))return;
    const where=c.name||c.id||'Cast',chapters=Array.isArray(c.relationship_chapters)?c.relationship_chapters:[];
    if(!String(c.name||c.display_name||'').trim())add('err','Character "'+(c.id||'?')+'" needs a display name.',where);
    const homeId=c.home?.location_id||c.home?.residence_id||'',home=loc(homeId);
    if(!homeId)add('err',where+' needs a home residence.',where);
    else if(!home)add('err',where+' home "'+homeId+'" is not in the location registry.',where);
    else{
      if(!(home.residents||[]).includes(c.id))add('err',where+' is not listed as a resident of '+home.name+'.',where);
      if(home.outside_room&&!(home.rooms||[]).some(room=>room.id===home.outside_room))
        add('err',home.name+' entrance room "'+home.outside_room+'" does not exist.',where);
      if(/^(npc_residence|npc_and_rentable_apartment)$/.test(home.type||'')){
        if(!home.discovery||home.discovery.discoverable!==true)
          add('err',home.name+' must be explicitly discoverable.',where);
        if(!Object.prototype.hasOwnProperty.call(home.discovery||{},'hidden_until_discovered'))
          add('err',home.name+' must say whether it is hidden until discovered.',where);
      }
      const checkHomeRoom=(placement,label)=>{
        if(placement?.room&&!(home.rooms||[]).some(room=>room.id===placement.room))
          add('err',label+' uses room "'+placement.room+'", which is not mapped in '+home.name+'.',where);
      };
      Object.entries(c.home_routine?.default_by_block||{}).forEach(([block,placement])=>
        checkHomeRoom(placement,pretty(block)+' home routine'));
      (c.home_routine?.overrides||[]).forEach((placement,index)=>
        checkHomeRoom(placement,'Home-routine override '+(index+1)));
      (c.schedule?.fixed_commitments||[]).forEach((commitment,index)=>
        checkHomeRoom(commitment.home_placement,'Schedule home placement '+(index+1)));
    }
    if(chapters.length!==5)add('err',where+' needs exactly five relationship story milestones; found '+chapters.length+'.',where);
    const levels=chapters.map(ch=>+ch.level);
    if(levels.join(',')!=='1,2,3,4,5')add('err',where+' relationship milestones must be ordered as levels 1 through 5.',where);
    const localChapterIds=new Set();
    chapters.forEach(ch=>{
      const id=String(ch?.id||'');
      if(!id)add('err','A relationship milestone has no story-arc id.',where);
      else if(slug(id)!==id)add('err','Relationship milestone id "'+id+'" must use lowercase words joined by underscores.',where);
      if(id&&localChapterIds.has(id))add('err','Two relationship milestones share id "'+id+'".',where);
      localChapterIds.add(id);
      if(id&&chapterArcIds.has(id)&&chapterArcIds.get(id)!==c.id)
        add('err','Relationship story-arc id "'+id+'" is also used by '+
          (chr(chapterArcIds.get(id))?.name||chapterArcIds.get(id))+'.',where);
      else if(id)chapterArcIds.set(id,c.id);
      if(!String(ch?.title||'').trim())add('err','Relationship milestone "'+(id||'?')+'" needs a title.',where);
      if(ch.route!==undefined&&!PA_RELATIONSHIP_ROUTES.some(route=>route.id===ch.route))
        add('err','Relationship milestone "'+(id||'?')+'" has unknown route "'+ch.route+'".',where);
      const plan=ch.story_plan;
      if(plan!==undefined){
        if(!plan||typeof plan!=='object'||Array.isArray(plan))
          add('err','Relationship milestone "'+(id||'?')+'" has an invalid story plan.',where);
        else{
          if(!PA_STORY_STATUSES.includes(plan.status))add('err','Relationship milestone "'+(id||'?')+
            '" has unknown writing status "'+plan.status+'".',where);
          if(plan.quest_count!==undefined&&(!Number.isInteger(+plan.quest_count)||+plan.quest_count<0||
            +plan.quest_count>PA_RELATIONSHIP_QUESTS_PER_LEVEL_MAX))
            add('err','Relationship milestone "'+(id||'?')+'" quest count must be a whole number from 0 to '+
              PA_RELATIONSHIP_QUESTS_PER_LEVEL_MAX+'.',where);
          ['supporting_characters','required_memories','prerequisite_quests'].forEach(key=>{
            if(!Array.isArray(plan[key]))add('err','Story plan field "'+key+'" must be a list.',where);
          });
          if(plan.primary_location&&!loc(locPart(plan.primary_location)))
            add('err','Story plan location "'+plan.primary_location+'" is not in the registry.',where);
          if(plan.status==='complete'&&typeof relationshipArcPlanIssues==='function'){
            const issues=relationshipArcPlanIssues(c,ch);
            if(issues.length)add('err','Milestone "'+(ch.title||id)+'" is marked complete but still needs: '+issues.join(' '),where);
          }
        }
      }
    });
    const storyArcs=Array.isArray(c.story_arcs)?c.story_arcs:[];
    const localStoryArcIds=new Set();
    storyArcs.forEach(arc=>{
      const id=String(arc?.id||'');
      if(!id)add('err','An independent character story has no id.',where);
      else if(slug(id)!==id)add('err','Character story id "'+id+'" must use lowercase words joined by underscores.',where);
      if(id&&localStoryArcIds.has(id))add('err','Two independent character stories share id "'+id+'".',where);
      localStoryArcIds.add(id);
      if(id&&chapterArcIds.has(id))add('err','Character story id "'+id+'" is also used by a relationship milestone.',where);
      if(id&&characterStoryArcIds.has(id)&&characterStoryArcIds.get(id)!==c.id)
        add('err','Character story id "'+id+'" is also used by '+
          (chr(characterStoryArcIds.get(id))?.name||characterStoryArcIds.get(id))+'.',where);
      else if(id)characterStoryArcIds.set(id,c.id);
      if(!String(arc?.title||'').trim())add('err','Character story "'+(id||'?')+'" needs a title.',where);
      if(!PA_CHARACTER_ARC_CATEGORIES.some(category=>category.id===arc.category))
        add('err','Character story "'+(id||'?')+'" has unknown category "'+arc.category+'".',where);
      if(!PA_STORY_STATUSES.includes(arc.status))add('err','Character story "'+(id||'?')+
        '" has unknown writing status "'+arc.status+'".',where);
      if(!Number.isInteger(+arc.quest_count)||+arc.quest_count<1||+arc.quest_count>PA_CHARACTER_ARC_QUEST_MAX)
        add('err','Character story "'+(id||'?')+'" quest count must be a whole number from 1 to '+
          PA_CHARACTER_ARC_QUEST_MAX+'.',where);
      if(!PA_CHARACTER_ARC_ENTRY_POLICIES.includes(arc.entry_policy))
        add('err','Character story "'+(id||'?')+'" has unknown entry policy.',where);
      if(!PA_CHARACTER_ARC_DECLINE_POLICIES.includes(arc.decline_policy))
        add('err','Character story "'+(id||'?')+'" has unknown decline policy.',where);
      if(arc.gate_meter&&!PA_CHARACTER_ARC_METERS.includes(arc.gate_meter))
        add('err','Character story "'+(id||'?')+'" has unknown relationship gate "'+arc.gate_meter+'".',where);
      if(!Number.isFinite(+arc.gate_value)||+arc.gate_value<0||+arc.gate_value>100)
        add('err','Character story "'+(id||'?')+'" meter minimum must be from 0 to 100.',where);
      ['supporting_characters','required_memories','prerequisite_quests','custom_requirements'].forEach(key=>{
        if(!Array.isArray(arc[key]))add('err','Character story field "'+key+'" must be a list.',where);
      });
      if(arc.primary_location&&!loc(locPart(arc.primary_location)))
        add('err','Character story location "'+arc.primary_location+'" is not in the registry.',where);
      if(arc.status==='complete'&&typeof characterStoryArcIssues==='function'){
        const issues=characterStoryArcIssues(c,arc);
        if(issues.length)add('err','Character story "'+(arc.title||id)+'" is marked complete but still needs: '+
          issues.join(' '),where);
      }
    });
    const social=c.social_preferences;
    if(!social||typeof social!=='object'||Array.isArray(social))
      add('err',where+' needs social activity preferences.',where);
    else{
      if(!Number.isFinite(social.invitation_threshold)||social.invitation_threshold<0||social.invitation_threshold>100)
        add('err','Hangout invitation threshold must be a number from 0 to 100.',where);
      const preferred=social.preferred_activities;
      if(!Array.isArray(preferred)||!preferred.length)add('err','Choose at least one preferred non-romantic hangout.',where);
      else{
        const known=new Set(PA_SOCIAL_ACTIVITIES.map(activity=>activity.id));
        if(new Set(preferred).size!==preferred.length)add('err','Preferred hangouts contain a duplicate.',where);
        preferred.filter(id=>!known.has(id)).forEach(id=>
          add('err','Preferred hangout "'+id+'" is not in the Port Alder social activity registry.',where));
      }
    }
  });
  const phoneMessages=validatePhoneAuthoring(add);
  const locationIds=new Set();
  P.locations.forEach(l=>{
    const where=l.name||l.id||'Places',id=String(l.id||'');
    if(!id)add('err','A location has no id.','Places');
    else if(slug(id)!==id)add('err','Location id "'+id+'" must use lowercase words joined by underscores.',where);
    if(id&&locationIds.has(id))add('err','Two locations share the id "'+id+'".',where);
    locationIds.add(id);
    if(!String(l.name||'').trim())add('err','Location "'+(id||'?')+'" has no display name.',where);
    if(districts.length&&!l.district)
      add('err','Location "'+(id||'?')+'" needs a game district.',where);
    else if(l.district&&districts.length&&!districts.some(d=>d.id===l.district))
      add('err','Location "'+(id||'?')+'" uses unknown district "'+l.district+'".',where);
    const roomIds=new Set();
    (l.rooms||[]).forEach(r=>{
      const roomId=String(r.id||'');
      if(!roomId)add('err','A room in '+(l.name||id||'a location')+' has no id.',where);
      else if(slug(roomId)!==roomId)add('err','Room id "'+roomId+'" in '+(l.name||id)+
        ' must use lowercase words joined by underscores.',where);
      if(roomId&&roomIds.has(roomId))add('err','Two rooms in '+(l.name||id)+
        ' share the id "'+roomId+'".',where);
      roomIds.add(roomId);
      if(!String(r.name||'').trim())add('err','Room "'+(roomId||'?')+'" in '+
        (l.name||id)+' has no display name.',where);
    });
  });
  const fixedPlayers=P.characters.filter(isPlayer);
  if(fixedPlayers.length)add('warn','Fixed player sheet'+(fixedPlayers.length===1?'':'s')+' ('+
    fixedPlayers.map(c=>c.name).join(', ')+') will be ignored. Port Alder creates the Player '+
    'from each user’s choices when a new game starts.','Cast');

  P.content.forEach(c=>{
    const w=c.title||c.id;
    if(!c.id)add('err','Content has no export id.',w);
    const typedId=c.type+'\u0000'+c.id;
    if(c.id&&ids.has(typedId))add('err','Two '+c.type+' items export as "'+c.id+'". One will overwrite the other.',w);
    ids.add(typedId);

    if(c.location&&!loc(locPart(c.location)))
      add('err','Points at location "'+locPart(c.location)+'", which is not in the registry.',w);
    else if(c.location&&roomPart(c.location)&&!roomOf(c.location))
      add('err','Room "'+roomPart(c.location)+'" does not exist in '+
        (loc(locPart(c.location))?.name||'')+'.',w);
    else if(c.location&&roomOf(c.location)){
      const acc=roomOf(c.location).access;
      if(acc==='restricted')add('warn','This scene is set in a restricted room ('+
        roomOf(c.location).name+'). The player normally cannot go in there.',w);
      if(acc==='permission_required')add('info','Set in a room the player needs permission to enter ('+
        roomOf(c.location).name+').',w);
    }
    else if(!c.location)add('info','No location set, so it can never be triggered by place.',w);

    (c.cast||[]).forEach(id=>{
      if(!chr(id))return add('err','Cast includes "'+id+'", which has no sheet.',w);
      if(!c.location)return;
      const ch2=chr(id);
      if(isPlayer(ch2))return;          // the player is wherever the scene is
      const checks=contentAvailability(ch2,c);
      const elsewhere=checks.filter(a=>a.where&&locPart(a.where)!==locPart(c.location));
      const unavailable=checks.filter(a=>!a.free);
      if(elsewhere.length)
        add('warn',ch2.name+' is somewhere else on '+elsewhere.map(a=>pretty(a.day)+' ('+
          placeName(a.where)+')').join(', ')+', not '+placeName(c.location)+'.',w);
      if(unavailable.length)
        add('warn',ch2.name+' is unavailable on '+unavailable.map(a=>pretty(a.day)+' ('+a.why+')').join(', ')+'.',w);
    });
    const questPeople=c.type==='quest'?[c.character,...(c.questPlan?.participants||[])]:[];
    if(c.type!=='repeatable'&&![...(c.cast||[]),...questPeople]
      .some(id=>id&&authoredChr(id)&&!isPlayer(authoredChr(id))))
      add('warn','No NPC is marked present, so there is nobody for the player to talk to.',w);

    const checkReqs=(reqs,label)=>(reqs||[]).forEach(r=>{
      if(r.type==='stat'||r.type==='custom_stat'||r.type==='chapter'||r.type==='met'||r.type==='memory'){
        if(isRuntimePlayerId(r.character))
          add('err','A '+label+' gate uses the Player as an NPC relationship. Use a Player value '+
            'or state flag instead; the Player has no fixed character sheet.',w);
        else if(!authoredChr(r.character))
          add('err','A '+label+' gate refers to "'+r.character+'", which has no sheet.',w);
      }
      if(r.type==='chapter'){
        const n=(authoredChr(r.character)?.relationship_chapters||[]).length;
        if(n&&+r.value>n)add('err','Gated on chapter '+r.value+' but that character only has '+n+'.',w);
      }
    });
    checkReqs(c.requires,'scene');

    if(c.type==='repeatable'){
      if(!(c.lines||[]).length)add('info','Repeatable has no variants yet.',w);
      else if(c.lines.length<4)add('info','Only '+c.lines.length+' variants — players will notice repeats.',w);
      if(!c.character)add('err','Repeatable has no character assigned.',w);
    }
    if(c.type==='quest')(c.stages||[]).forEach((s,i)=>{
      checkReqs(s.requires,'stage');
      if(!countLines(s.nodes||[]))add('warn','Stage '+(i+1)+' ("'+s.title+'") has no lines.',w);
      const completion=s.completion||(s._authored&&s._authored.completion);
      const hidden=s.hiddenUntil||(s._authored&&s._authored.hidden_until);
      [[completion,'waits for'],[hidden,'is hidden until']].forEach(([rule,verb])=>{
        if(rule?.event==='activity_count_at_least'){
          const activity=P.content.find(x=>x.type==='activity'&&x.id===rule.activity);
          if(!activity)add('err','Stage '+(i+1)+' '+verb+' activity "'+(rule.activity||'')+
            '", but that activity does not exist.',w);
          if((+rule.value||0)<1)add('err','Stage '+(i+1)+' needs a positive activity completion count.',w);
          return;
        }
        if(!['text_received','text_replied','text_sent'].includes(rule?.event))return;
        const messageId=rule.event==='text_replied'?(rule.thread||rule.message):rule.message;
        const entry=phoneMessages.get(messageId);
        if(!entry)return add('err','Stage '+(i+1)+' '+verb+' missing phone message "'+
          (messageId||'')+'".',w);
        const expected=rule.event==='text_sent'?'outgoing':'incoming';
        if(textMessageDirection(entry.message)!==expected)add('err','Stage '+(i+1)+' uses a '+
          rule.event+' rule with a '+textMessageDirection(entry.message)+' message.',w);
        if(rule.character&&rule.character!==entry.owner.id)add('err','Stage '+(i+1)+
          ' names the wrong contact for phone message "'+messageId+'".',w);
      });
      if(s.location&&!loc(locPart(s.location)))
        add('err','Stage '+(i+1)+' points at a location not in the registry.',w);
      else if(s.location&&roomPart(s.location)&&!roomOf(s.location))
        add('err','Stage '+(i+1)+' points at room "'+roomPart(s.location)+
          '", which does not exist in '+(loc(locPart(s.location))?.name||'that location')+'.',w);
    });
    if(c.type==='quest'){
      const event=c.questPlan?.eventDraft||c.questPlan?.event;
      if(event?.location&&!loc(locPart(event.location)))
        add('err','The follow-up event points at location "'+locPart(event.location)+
          '", which is not in the registry.',w);
      else if(event?.location&&roomPart(event.location)&&!roomOf(event.location))
        add('err','The follow-up event points at room "'+roomPart(event.location)+
          '", which does not exist in '+(loc(locPart(event.location))?.name||'that location')+'.',w);
    }
    if(c.type==='conversation'&&!countLines(c.nodes||[]))add('info','Conversation is empty.',w);
  });

  walkAll((n,c,p,isOpt)=>{
    const w=c.title||c.id;
    if(isOpt){
      if(!countLines(n.nodes||[])&&!(n.nodes||[]).some(x=>x.type==='jump'))
        add('warn','Choice "'+(n.text||'').slice(0,34)+'" leads nowhere.',w);
      if(!String(n.text||'').trim())add('warn','A choice option has no text.',w);
      const impossible=impossibleStats(n.requires);
      if(impossible)add('warn','Branch "'+(n.text||'').slice(0,34)+'" can never run: '+
        impossible[0]+' must be both at least '+impossible[1].min+' and at most '+impossible[1].max+'.',w);
      return;
    }
    if(n.type==='jump'){
      if(!n.target)add('err','A jump node has no target.',w);
      else if(!P.content.some(x=>x.id===n.target))add('err','Jump points at "'+n.target+'", which does not exist.',w);
      else if(n.target===c.id)add('warn','A jump points back at its own scene.',w);
    }
    if(n.type==='line'&&!String(n.text||'').trim())add('warn','An empty line is in the tree.',w);
    if(n.type==='line'&&!chr(n.speaker))add('err','A line is spoken by "'+n.speaker+'", who has no sheet.',w);
    if(n.type==='line'&&isPlayer(chr(n.speaker))&&!$('writePlayer')?.checked)
      add('err','A dialogue line is attributed to the player, but drafting player lines is '+
        'switched off. Move it into a choice option or turn the setting back on.',w);
  });

  const reg=flagRegistry(),keys=Object.keys(reg);
  keys.forEach(k=>{
    const r=reg[k];
    const seeded=(r.character_refs||[]).some(ref=>{
      const ch=authoredChr(ref.character);
      return ch&&(ch.relationship_defaults?.[ref.key]!==undefined||ch.custom_stats?.[ref.key]!==undefined);
    });
    const auto=k.startsWith('met_');
    if(!r.sets.length&&!seeded&&!auto)
      add('warn','"'+k+'" is required somewhere but nothing ever sets it.',r.reads.join(', '));
    if(!r.reads.length)
      add('info','"'+k+'" is set but no condition reads it.',r.sets.join(', '));
    if(auto&&!authoredChr(k.slice(4))){
      const near=P.characters.find(c=>c.id.startsWith(k.slice(4))||k.slice(4).startsWith(c.id));
      add('err','"'+k+'" checks meeting "'+k.slice(4)+'", who has no sheet.'+
        (near?' Did you mean met_'+near.id+'?':''),r.reads.join(', ')||'Flags');
    }
    (r.character_refs||[]).forEach(ref=>{
      if(authoredChr(ref.character))return;
      add('err','"'+k+'" refers to character "'+ref.character+'", who has no sheet.',
        (r.reads.concat(r.sets)).join(', '));
    });
  });
  keys.forEach((a,i)=>keys.slice(i+1).forEach(b=>{
    if(a!==b&&lev(a,b)<=2&&Math.min(a.length,b.length)>4)
      add('warn','"'+a+'" and "'+b+'" differ by a character or two — likely a typo.','Flags');
  }));

  if(P.locations.some(l=>l.tags?.includes('package')))
    P.characters.filter(c=>!isPlayer(c)).forEach(c=>{
      const home=c.home?.location_id||c.home?.residence_id;
      if(home&&!loc(locPart(home)))add('warn',c.name+' has home location "'+home+
        '", which is not in the game registry.','Schedules');
      const checkHomePlacement=(placement,label)=>{
        const room=placement?.room;if(!room)return;
        if(!home||!loc(locPart(home)))return add('warn',c.name+' has '+label+
          ' room "'+room+'" but no valid home location.','Schedules');
        if(!roomOf(locPart(home)+'.'+room))add('err',c.name+' has '+label+' room "'+room+
          '", which does not exist in '+loc(locPart(home)).name+'.','Schedules');
      };
      (c.schedule?.fixed_commitments||[]).forEach(f=>{
        checkHomePlacement(f.home_placement,'a schedule placement');
        if(!f.location||!loc(locPart(f.location)))
          return add('warn',c.name+"'s \""+pretty(f.activity||'commitment')+
            '" has no real location, so the tool cannot say where they are. '+
            'Set it in Edit schedule.','Schedules');
        if(roomPart(f.location)&&!roomOf(f.location))
          add('err',c.name+"'s \""+pretty(f.activity||'commitment')+
            '" points at room "'+roomPart(f.location)+'", which does not exist in '+
            (loc(locPart(f.location))?.name||'that location')+'.','Schedules');
      });
      Object.values(c.home_routine?.default_by_block||{}).forEach(p=>
        checkHomePlacement(p,'a home-routine placement'));
      (c.home_routine?.overrides||[]).forEach(p=>checkHomePlacement(p,'a home-routine override'));
    });

  const lk=links(),inb={};
  lk.forEach(l=>inb[l.to]=(inb[l.to]||0)+1);
  const starts=P.content.filter(c=>c.start);
  if(P.content.length&&!starts.length)
    add('warn','No passage is marked as a start. Nothing has an obvious entry point.','Story map');
  P.content.forEach(c=>{
    if(c.type==='repeatable'||c.start)return;
    if(!inb[c.uid]&&!(c.requires||[]).length&&!c.location)
      add('warn','"'+(c.title||c.id)+'" has no inbound link, no gate, and no location — nothing can reach it.','Story map');
  });

  P.content.filter(c=>c.type==='quest'&&c.after).forEach(c=>{
    if(!P.content.some(x=>x.type==='quest'&&x.id===c.after))
      add('err','"'+(c.title||c.id)+'" starts after "'+c.after+'", which does not exist.','Chains');
    const path=new Set([c.id]);let cur2=c.after;
    while(cur2){
      if(path.has(cur2)){add('err','Quest chain loops: '+[...path].join(' → ')+' → '+cur2+
        '. Nothing in that loop can ever start.','Chains');break;}
      path.add(cur2);
      cur2=P.content.find(x=>x.type==='quest'&&x.id===cur2)?.after;
    }
  });

  P.content.filter(c=>c.type==='activity').forEach(c=>{
    const w=c.title||c.id;
    if(!c.character)add('err','Activity has no character assigned.',w);
    if((c.incrementsOn||c._authored?.increments_on||'completed')!=='explicit_success')
      add('err','This imported activity still counts every finished attempt. Change “Count when” to a marked successful branch before game export.',w);
    (c.stages||[]).forEach(s=>(s.requires||[]).forEach(r=>{
      if((r.type==='stat'||r.type==='custom_stat'||r.type==='chapter'||r.type==='met'||r.type==='memory')&&
         !authoredChr(r.character))add('err','Milestone gate refers to "'+r.character+'", which has no sheet.',w);
    }));
    const ms=(c.stages||[]).slice(1);
    const milestoneIds=new Set();
    if(!countLines((c.stages||[])[0]?.nodes||[]))
      add('warn','Activity has no "every time" dialogue, so ordinary repeats play nothing.',w);
    const seen2={};
    ms.forEach(s=>{
      if(!s.id)add('err','A milestone has no export id.',w);
      else if(milestoneIds.has(s.id))add('err','Two milestones use id "'+s.id+'". Once-only tracking would treat them as one.',w);
      milestoneIds.add(s.id);
      if(!countLines(s.nodes||[]))add('warn','Milestone "'+s.title+'" has no lines.',w);
      const n=+s.at||0;
      if(seen2[n]&&!(s.requires||[]).length&&!(seen2[n].requires||[]).length)
        add('warn','Two milestones both unlock after '+n+' successful completions with no condition between them — '+
          'only one will ever run.',w);
      seen2[n]=s;
    });
    if((c.incrementsOn||c._authored?.increments_on)==='explicit_success'){
      const successCount=list=>{let marked=0;
        const scan=items=>(items||[]).forEach(n=>{
        if(n.type==='line'&&n.activitySuccess){marked++;return;}
        if(n.type!=='choice'&&n.type!=='gate')return;
        (n.options||[]).forEach(o=>{if(o.activitySuccess)marked++;scan(o.nodes);});
      });
        scan(list);return marked;};
      (c.stages||[]).forEach((s,i)=>{
        if(!successCount(s.nodes))add('err',(i?'Milestone "'+(s.title||s.id)+'"':'The ordinary visit')+
          ' has no route marked “Counts as success,” so completing it cannot advance the activity.',w);
      });
    }
  });

  const miss=missingRefs();
  if(miss.length)add('info',miss.length+' referenced character'+(miss.length===1?' has':'s have')+
    ' no sheet: '+miss.map(m=>m.id).join(', '),'Cast','stubs');

  const cov=coverage();
  P.characters.filter(c=>!isPlayer(c)).forEach(c=>{
    const v=cov[c.id];
    if(v&&!v.conv&&!v.quest&&!v.rep)add('info',c.name+' has no dialogue anywhere yet.','Coverage');
  });

  const rank={err:0,warn:1,info:2};
  return out.sort((a,b)=>rank[a.sev]-rank[b.sev]);
}
