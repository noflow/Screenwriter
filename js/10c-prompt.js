function turnInstruction(){
  const last=lastSpoken();
  const pc=playerChar();
  const draft=!!$('writePlayer')?.checked;
  if(!last){
    return 'This is the opening. Start with the most natural first speaker for the situation.';
  }
  const who=chr(last.speaker);
  const name=who?who.name:last.speaker;
  const wasPlayer=isPlayer(who)||(pc&&last.speaker===pc.id);
  if(wasPlayer){
    return 'Last speaker was the player ('+name+'). The next spoken line MUST come from an NPC '+
      'present in the scene. Do not have the player speak again right away.';
  }
  return 'Last speaker was '+name+'. The next spoken line should be the player\'s turn'+
    (draft
      ? ' — you may write one short neutral player line (speaker "'+(pc?pc.id:'player')+'"), then the NPC reply.'
      : ' — either leave room for a player choice, or have the NPC react briefly and wait. '+
        'Do not let '+name+' monologue for multiple consecutive lines unless the situation clearly requires it.');
}

/** The rule the model most needs and is most likely to break. */
function playerRule(){
  const pc=playerChar();
  const who=pc?pc.name:'the player';
  const id=pc?pc.id:'player';
  const draft=$('writePlayer')?.checked;
  return '\n\n# Who is who\n'+
    who+' is the PLAYER CHARACTER — the person playing this game.'+
    (draft
      ? ' You may write '+who+'\'s spoken lines using speaker "'+id+'", so the writer has a '+
        'draft to edit. Keep them short and in a neutral voice that most players would accept. '+
        'Never narrate what '+who+' privately thinks or feels, and never decide something the '+
        'player should be choosing — real decisions belong in choice options.'
      : ' Never write a line of dialogue for '+who+', and never describe what '+who+' says, '+
        'thinks, feels or decides. Their words only ever appear as choice options.')+
    ' Everyone else is an NPC you control.'+
    (presentNPCs().length
      ? '\nThe NPCs in this scene are: '+presentNPCs().map(c=>c.name+' ('+c.id+')').join(', ')+
        '. Use only these people. Do not invent anyone.'
      : '');
}

function sceneBrief(){
  const c=cur(),l=loc(locPart(c.location));
  const target=typeof scenePlanTarget==='function'?scenePlanTarget(c):c;
  const bits=['# Scene','Title: '+(c.title||'untitled')];
  const pb=placeBrief(c.location);
  if(pb)bits.push('Location: '+pb);
  const days=(c.type==='conversation'||c.type==='activity')?contentDays(c):[c.day].filter(Boolean);
  bits.push('When: '+(days.length?days.map(pretty).join(' or '):'any day')+', '+pretty(c.block));
  present().forEach(ch=>{
    const checks=contentAvailability(ch,c);
    bits.push(ch.name+' availability: '+checks.map(a=>pretty(a.day)+' — '+
      (a.free?'free':'occupied')+' ('+a.why+')').join('; ')+'.');
  });
  const owner=chr(c.character)||present()[0];
  const ch=owner?.relationship_chapters?.find(x=>x.level===+c.chapter);
  if(ch){
    if($('useAdult')?.checked)
      bits.push('Relationship stage: '+ch.level+' — '+ch.title+'. Use this as tone guidance, but adult intimacy is allowed when the characters want it.');
    else
      bits.push('Relationship stage: '+ch.level+' — '+ch.title+'. Write at that level of closeness, not beyond it.');
  }
  if(target?.premise||c.premise)bits.push('Premise: '+(target?.premise||c.premise));
  return bits.join('\n');
}

function historyBrief(){
  const t=transcriptAt(focusPath);
  if(!t.length)return '(nothing yet — this is the opening)';
  return t.slice(-60).map(n=>n.speaker==='__c__'?'[player chose: '+n.text+']'
    :(chr(n.speaker)?.name||n.speaker)+': '+n.text).join('\n');
}

function buildPrompt(input){
  const c=cur(),n=+$('burst').value||3;
  const cast=presentNPCs().map(charBrief).join('\n\n')||'(no characters marked present)';
  const head='You write dialogue for a visual novel. Stay strictly in character.\n\n# Characters\n'+cast+
    playerRule()+'\n\n'+sceneBrief()+boundsBrief()+adultBrief()+canonBrief();

  if(mode==='variants'){
    const who=chr(c.character);
    return head+'\n\n# Task\nWrite '+Math.max(3,Math.min(12,n*3))+' interchangeable idle lines for '+
      (who?who.name:'the character')+' — what they say when the player approaches with nothing specific going on'+
      (c.location?' at '+placeName(c.location):'')+'. '+
      (input?'Situation: '+input+'. ':'')+
      'Each must stand alone, need no reply, and sound like a different day. Vary length. No greetings repeated.\n\n'+
      'Reply with ONLY this JSON object: {"lines":[{"text":"...","emotion":"..."}]}. '+
      'No prose, no fences.';
  }
  const body='\n\n# The scene so far\n'+historyBrief()+'\n\n# Turn order\n'+turnInstruction()+avoidRepeatBrief()+'\n\n# Task\n';
  const ids=speakableIds(c).join(', ');

  if(mode==='scene'){
    const plan=(typeof scenePlanTarget==='function'?scenePlanTarget(c):c)?.scenePlan||{};
    const planned=plan.outline
      ? '# Approved beat outline\n'+plan.outline+'\n\n# Original plan\n'+(plan.brief||input)
      : input;
    return 'You write scenes for a life-sim visual novel. Stay strictly in character.\n\n'+
      '# Everyone in this game\n'+npcs().map(charBrief).join('\n\n')+playerRule()+
      '\n\n# Places\n'+P.locations.map(l=>l.id+' — '+l.name+(l.notes?': '+l.notes:'')).join('\n')+
      boundsBrief()+adultBrief()+canonBrief()+
      '\n\n# The scene to write\n'+planned+
      '\n\n# How to build it\n'+
      'Open with a line of narration setting the place. Let the characters talk through a real '+
      'exchange (roughly 12–25 lines total is fine — do not rush).\n\n'+
      '# Format\nWrite ordinary role-play transcript text — NOT JSON. Use one line per beat:\n'+
      '  *The room is quiet except for the television.*\n'+
      '  Elena Reyes: "Want to join me?"\n'+
      '  Elena Reyes: *She pats the cushion beside her.*\n\n'+
      'Use the characters\' names before spoken lines. Put narration and actions in *asterisks*. '+
      'Do not use markdown tables, code fences, or JSON.\n\n'+
      (plan.statGate
        ? 'This scene ends with an AUTOMATIC stat outcome. Do not give the player a choice at this point. '+
          'After the shared scene, use exactly this shape. Each outcome needs at least two response beats:\n'+
          '  STAT OUTCOMES:\n'+
          '  HIGH:\n'+
          '  '+(chr(plan.statGate.character)?.name||plan.statGate.character)+': "A line fitting the high-stat outcome."\n'+
          '  *A second beat.*\n'+
          (plan.statGate.middle
            ? '  MIDDLE:\n'+
              '  '+(chr(plan.statGate.character)?.name||plan.statGate.character)+': "A line fitting the middle-stat outcome."\n'+
              '  *A second beat.*\n'
            : '')+
          '  LOW:\n'+
          '  '+(chr(plan.statGate.character)?.name||plan.statGate.character)+': "A line fitting the low-stat outcome."\n'+
          '  *A second beat.*\n\n'
        : 'To end with player choices, use this simple shape. Each option needs at least two response beats:\n'+
      '  CHOICES:\n'+
      '  1. "Sure, I\'ll stay a while."\n'+
      '     THEN:\n'+
      '     Elena Reyes: "Good."\n'+
      '     *She makes room on the sofa.*\n'+
      '  2. "I should get going."\n'+
      '     THEN:\n'+
      '     Elena Reyes: "Another time, then."\n'+
      '     *She tries not to sound disappointed.*\n\n')+
      'Keep the branches genuinely different. Reply with the transcript only.';
  }

  if(mode==='choice')
    return head+body+'Write '+Math.max(2,Math.min(4,n))+' options the player could say or do here. '+
      'Each must lead somewhere genuinely different. Under 90 characters each.'+
      (input?' The player is weighing: '+input:'')+
      '\n\nReply with ONLY this JSON object: {"options":["...","..."]}. No prose, no fences.';

  if(mode==='chat'){
    const lines=Math.max(4,Math.min(6,n));
    return head+body+
      'Write the NEXT '+lines+' brand-new spoken lines only. This is an ongoing chat. '+
      'Do NOT force a choice, do NOT wrap up, do NOT summarize, and do NOT repeat anything already said. '+
      'Each line must move the conversation forward with new information, a new reaction, or a new question. '+
      'Alternate speakers. Never give the same speaker two lines in a row unless it is a short beat of action. '+
      (input?'Writer direction: '+input+'. ':'')+
      '\n\nReply with ONLY this JSON object: {"lines":[{"speaker":"character_id","text":"...",'+
      '"emotion":"..."}]}. '+
      'speaker must be one of: '+ids+', or "__narrator__" for narration. '+
      'emotion is one lowercase word. Wrap physical action in *asterisks*. No prose, no fences.';
  }

  const meId=$('sayAs')?.value||$('playAs')?.value,me=chr(meId);
  const cap=Math.max(3,Math.min(6,n));
  const rule=mode==='play'
    ? (input
        ? (me?me.name:'The player')+' says or does: '+input+'\n\nWrite what happens next — '+
          cap+' NEW lines from the OTHER characters only. Never write lines for '+
          (me?me.name:'the player')+'. Do not repeat earlier lines. Continue; do not force an ending.'
        : 'Carry the conversation forward — '+cap+' NEW lines. Start with a line for '+
          (me?me.name:'the player')+' (speaker "'+meId+'") that follows naturally from what was '+
          'just said, then the replies it draws. Keep the player\'s line short and neutral. '+
          'Do not wrap the scene up. Do not repeat earlier wording.')
    : 'Stage direction from the writer: '+input+'\n\nWrite '+cap+
      ' NEW lines carrying that out. Continue the conversation; do not force a closing beat or repeat earlier lines.';

  return head+body+rule+
    '\n\nReply with ONLY this JSON object: {"lines":[{"speaker":"character_id","text":"...",'+
    '"emotion":"..."}]}. '+
    'speaker must be one of: '+ids+', or "__narrator__" for narration with no speaker. '+
    'emotion is one lowercase word for sprite selection. '+
    'Wrap physical action in *asterisks* inside text. No prose, no fences.';
}

/** Turns the model's scene JSON into editor nodes. */
