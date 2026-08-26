function speakableIds(c){
  const ids=(c?.cast||[]).filter(id=>!isPlayer(chr(id)));
  if($('writePlayer')?.checked)ids.unshift('player');
  return ids;
}

/** Last non-narration, non-choice line in the focused path. */
function lastSpoken(){
  const t=transcriptAt(focusPath).filter(n=>n.speaker&&n.speaker!=='__c__'&&n.speaker!=='__narrator__');
  return t.length?t[t.length-1]:null;
}

function speakerPool(){
  const ids=['player'];
  (cur()?.cast||[]).forEach(id=>{if(id&&!isPlayer(chr(id))&&!ids.includes(id))ids.push(id);});
  npcs().forEach(ch=>{if(!ids.includes(ch.id))ids.push(ch.id);});
  ids.push('__narrator__');
  return ids;
}

function paintSayAs(){
  const sel=$('sayAs'); if(!sel)return;
  const keep=sel.value;
  const ids=speakerPool();
  sel.innerHTML=ids.map(id=>{
    const c=chr(id)||{name:id};
    return '<option value="'+esc(id)+'">'+esc(c.name||id)+'</option>';
  }).join('');
  if(keep&&ids.includes(keep))sel.value=keep;
  else if($('playAs')?.value&&ids.includes($('playAs').value))sel.value=$('playAs').value;
}

function historyTexts(){
  return transcriptAt(focusPath).filter(n=>n.text&&n.speaker!=='__c__').map(n=>n.text);
}

function normLine(t){
  return String(t||'').toLowerCase().replace(/[*_]+/g,' ').replace(/[^a-z0-9 ]+/g,' ')
    .replace(/\s+/g,' ').trim();
}
function similarLine(a,b){
  a=normLine(a); b=normLine(b);
  if(!a||!b)return false;
  if(a===b)return true;
  if(a.length>18&&(b.includes(a)||a.includes(b)))return true;
  const A=new Set(a.split(' ').filter(w=>w.length>2));
  const B=new Set(b.split(' ').filter(w=>w.length>2));
  if(!A.size||!B.size)return false;
  let n=0; A.forEach(w=>{if(B.has(w))n++;});
  return n/Math.min(A.size,B.size)>=0.78 && Math.min(a.length,b.length)>22;
}

/** Drop echoes of history or of earlier lines in this same batch. */
function takeFreshLines(rows,c){
  const seen=historyTexts().slice();
  const out=[], droppedEcho=0, droppedSpeaker={n:0};
  (rows||[]).forEach(l=>{
    if(!l||!l.text)return;
    const t=String(l.text).trim();
    if(!t)return;
    if(seen.some(s=>similarLine(s,t))){droppedEcho++;return;}
    const sp=resolveSpeaker(l.speaker,c);
    if(!sp){droppedSpeaker.n++;return;}
    if(sp!=='__narrator__'&&!isPlayer(chr(sp))&&!(c.cast||[]).includes(sp))
      c.cast=(c.cast||[]).concat(sp);
    out.push({type:'line',speaker:sp,text:t,
      emotion:sp==='__narrator__'?'':String(l.emotion||'').toLowerCase().slice(0,18)});
    seen.push(t);
  });
  return {lines:out,droppedEcho,droppedSpeaker:droppedSpeaker.n};
}

function avoidRepeatBrief(){
  const recent=historyTexts().slice(-16);
  if(!recent.length)return '';
  return '\n\n# Do not repeat\nThese lines are already in the scene. Do not copy, paraphrase, or recycle them. Advance the conversation with NEW wording:\n- '+
    recent.map(t=>'"'+String(t).replace(/\s+/g,' ').slice(0,140)+'"').join('\n- ');
}

function insertManualLine(){
  const c=cur();
  if(!c)return note('Open a conversation, quest, or activity first.',true);
  if(c.type==='repeatable')return note('Repeatables use the variant list, not the dialogue tree.',true);
  const t=$('line').value.trim();
  if(!t)return note('Type the line in the box, pick who is speaking, then Add line.',true);
  const sp=$('sayAs')?.value||$('playAs')?.value||speakerPool()[0];
  if(!sp)return note('Pick who is speaking in the dropdown.',true);
  if(sp!=='__narrator__'&&!chr(sp))return note('That speaker has no sheet.',true);
  if(sp!=='__narrator__'&&!(c.cast||[]).includes(sp)&&!isPlayer(chr(sp)))
    c.cast=(c.cast||[]).concat(sp);
  listAt(focusPath).push({type:'line',speaker:sp,text:t,emotion:''});
  $('line').value='';$('line').style.height='auto';
  save();paintBody();$('tree').scrollTop=$('tree').scrollHeight;
  note('Added '+(chr(sp)?.name||'narration')+'\'s line. Press Continue chat to write the reply.');
}


/** Tell the model whose turn it is so conversations alternate instead of monologuing. */
