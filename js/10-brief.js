function charBrief(c){
  const p=c.profile||{},pe=c.personality||{},t=c.text_style||{};
  const bits=['## '+c.name+'  (id: '+c.id+')'];
  if(p.age||p.occupation)bits.push((p.age?p.age+', ':'')+pretty(p.occupation||p.role||''));
  if(pe.archetype)bits.push('Archetype: '+pretty(pe.archetype));
  if(pe.traits)bits.push('Traits: '+pe.traits.map(pretty).join(', '));
  if(pe.values)bits.push('Values: '+pe.values.map(pretty).join(', '));
  if(pe.social_style)bits.push('Socially: '+pretty(pe.social_style));
  if(t.tone)bits.push('Speech: '+pretty(t.tone)+(t.emoji_rate?', emoji '+pretty(t.emoji_rate):''));
  if(c.goals)bits.push('Wants: '+c.goals.map(pretty).join('; '));
  if(c.conversation_topics)bits.push('Will talk about: '+c.conversation_topics.map(pretty).join(', '));
  if($('useConn').checked&&c.connections?.length)
    bits.push('Knows: '+c.connections.map(x=>(chr(x.character)?.name||x.character)+' ('+pretty(x.relation)+')').join(', '));
  if($('useAdult').checked&&c.private_profile&&p.romance_eligible!==false)
    bits.push('Adult profile: '+JSON.stringify(c.private_profile));
  return bits.join('\n');
}

function boundsBrief(){
  if(!$('useBounds').checked)return '';
  const out=[];
  present().forEach(c=>{
    const b=c.boundaries||{},lim=[...(b.hard_limits||[]),...(c.private_profile?.adult_preferences?.hard_limits||[])];
    if(c.profile&&c.profile.romance_eligible===false)
      out.push(c.name+' is NOT a romance option. Never write romantic or sexual content between '+c.name+
        ' and the player, and never write '+c.name+' as flirting with or attracted to the player. '+
        'This holds at every chapter level and overrides anything else in this prompt.');
    if(b.family_only)out.push(c.name+' is family. Warmth between them and the player is parental, never romantic.');
    if(lim.length)out.push(c.name+' must never be written into: '+lim.map(pretty).join(', ')+'.');
    if(b.alcohol_consent)out.push(c.name+' — alcohol: '+pretty(b.alcohol_consent)+'.');
    if(b.protection_policy)out.push(c.name+' — '+pretty(b.protection_policy)+'.');
  });
  return out.length?'\n\n# Hard constraints\n'+out.join('\n'):'';
}

/** Strong adult permission when the writer has enabled it. Hard limits still apply. */
function adultBrief(){
  if(!$('useAdult')?.checked)return '';
  const bits=[];
  present().forEach(c=>{
    if(typeof isAdult==='function'&&!isAdult(c))return;
    if(c.profile?.romance_eligible===false)return;
    const ap=c.private_profile?.adult_preferences;
    if(ap)bits.push(c.name+': '+JSON.stringify(ap));
  });
  return '\n\n# Private profile (writer enabled)\n'+
    'Use each character\'s private profile as in-character context. Stay inside the hard limits.'+
    (bits.length?'\n'+bits.join('\n'):'');
}

const present=()=>{const c=cur();return (c?.cast||[]).map(chr).filter(Boolean);};
/** Only NPCs can be given generated dialogue. */
const presentNPCs=()=>present().filter(c=>!isPlayer(c));
/** Who may be given a spoken line, given the current drafting setting. */
