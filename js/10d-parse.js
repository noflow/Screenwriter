function buildScene(list,ids,depth){
  const out=[];
  (list||[]).forEach(n=>{
    if(!n)return;
    if(n.choice||n.choices){
      const opts=coerceArray(n.choice||n.choices||[]).slice(0,4).map(o=>({
        text:String(o.text||o.option||'…').trim(),
        flag:String(o.effect||o.effects||o.flag||'').trim(),
        requires:[],
        nodes:depth<2?buildScene(coerceArray(o.then||o.nodes||[]),ids,depth+1):[]
      })).filter(o=>o.text);
      if(opts.length)out.push({type:'choice',options:opts});
      return;
    }
    const text=String(n.text||n.line||'').trim();
    if(!text)return;
    const sp=resolveSpeaker(n.speaker,cur()||{cast:ids});
    if(!sp)return;                               // the player doesn't get dialogue lines
    out.push({type:'line',speaker:sp,text,
      emotion:sp==='__narrator__'?'':String(n.emotion||n.expression||'').toLowerCase().slice(0,18)});
  });
  return out;
}

/** Converts a normal role-play transcript into editor nodes. Scene generation uses
    this instead of asking the model to hand-author a fragile JSON tree. */
function roleplayNodes(source,c){
  const out=[];
  String(source||'').split(/\r?\n/).forEach(raw=>{
    let line=raw.trim();
    if(!line||/^then\s*:?$/i.test(line))return;
    line=line.replace(/^[-•]\s*/,'').replace(/^\*\*(.+?):\*\*\s*/,'$1: ');
    const hit=line.match(/^([^:]{1,80}):\s*(.+)$/);
    if(hit){
      const speaker=resolveSpeaker(hit[1].trim(),c);
      const text=hit[2].trim();
      if(speaker&&text)out.push({type:'line',speaker,text,emotion:''});
      else if(text)out.push({type:'line',speaker:'__narrator__',text,emotion:''});
    }else{
      out.push({type:'line',speaker:'__narrator__',text:line,emotion:''});
    }
  });
  return out;
}

function sceneLocation(raw){
  const value=String(raw||'').trim();
  if(!value)return '';
  return resolvePlaceRef(value)||'';
}

function cleanChoiceText(raw){
  return String(raw||'').trim().replace(/^["“]/,'').replace(/["”]$/,'').trim();
}

function parseRoleplayScene(raw,c){
  let text=String(raw||'').replace(/<think>[\s\S]*?<\/think>/gi,'').trim();
  text=text.replace(/```(?:text|markdown)?\s*/gi,'').replace(/```/g,'').trim();
  const result={title:'',location:'',block:'',cast:[],nodes:[]};
  const lines=text.split(/\r?\n/);
  const story=[],choiceLines=[],outcomeLines=[];
  let section='story';

  lines.forEach(rawLine=>{
    const line=rawLine.trim();
    if(/^choices?\s*:\s*$/i.test(line)){section='choices';return;}
    if(/^stat outcomes?\s*:\s*$/i.test(line)){section='outcomes';return;}
    if(section==='choices'){choiceLines.push(rawLine);return;}
    if(section==='outcomes'){outcomeLines.push(rawLine);return;}
    const title=line.match(/^title\s*:\s*(.+)$/i);
    const location=line.match(/^location\s*:\s*(.+)$/i);
    const block=line.match(/^(?:time|block)\s*:\s*(.+)$/i);
    if(title){result.title=title[1].trim().slice(0,60);return;}
    if(location){result.location=sceneLocation(location[1]);return;}
    if(block&&BLOCKS.includes(block[1].trim())){result.block=block[1].trim();return;}
    story.push(rawLine);
  });

  result.nodes=roleplayNodes(story.join('\n'),c);
  const options=[];let current=null;
  choiceLines.forEach(rawLine=>{
    const line=rawLine.trim();
    const option=line.match(/^(?:\d+\s*[.)]|[-•])\s*(.+)$/);
    if(option){
      current={text:cleanChoiceText(option[1]),flag:'',requires:[],nodes:[]};
      if(current.text)options.push(current);
      return;
    }
    if(current)current.nodes.push(...roleplayNodes(rawLine,c));
  });
  // Keep only choices that actually lead somewhere, so the editor never opens on
  // empty branches just because the writer stopped after listing options.
  const complete=options.filter(o=>o.nodes.length);
  if(complete.length>1)result.nodes.push({type:'choice',options:complete.slice(0,4)});

  const gate=(typeof scenePlanTarget==='function'?scenePlanTarget(c):c)?.scenePlan?.statGate;
  if(gate&&outcomeLines.length){
    const buckets={high:[],middle:[],low:[]};let active='';
    outcomeLines.forEach(rawLine=>{
      const label=rawLine.trim();
      if(/^high\s*:?$/i.test(label)){active='high';return;}
      if(/^middle\s*:?$/i.test(label)){active='middle';return;}
      if(/^low\s*:?$/i.test(label)){active='low';return;}
      if(active)buckets[active].push(rawLine);
    });
    const high=roleplayNodes(buckets.high.join('\n'),c),middle=roleplayNodes(buckets.middle.join('\n'),c),low=roleplayNodes(buckets.low.join('\n'),c);
    if(high.length&&low.length){
      const name=chr(gate.character)?.name||gate.character;
      const value=Math.max(0,+gate.value||0);
      const lowValue=Math.min(value-1,Math.max(0,+gate.lowValue||0));
      const options=[
        {text:name+' '+gate.key+' ≥ '+value,requires:[{type:'stat',character:gate.character,key:gate.key,op:'gte',value}],flag:gate.highEffect||'',nodes:high},
        // Ordered gates make the final low outcome a true fallback. This covers
        // fractional meters (49.5) instead of leaving a gap between >=50 and <=49.
        {text:name+' '+gate.key+' < '+(gate.middle?lowValue+1:value),requires:[],flag:gate.lowEffect||'',nodes:low}
      ];
      if(gate.middle&&middle.length)options.splice(1,0,{text:name+' '+gate.key+' > '+lowValue+' and < '+value,
        requires:[{type:'stat',character:gate.character,key:gate.key,op:'gte',value:lowValue+0.000001}],flag:gate.middleEffect||'',nodes:middle});
      result.nodes.push({type:'gate',options});
    }
  }
  if(!result.nodes.length)throw new Error('the reply did not contain any usable role-play lines');
  return result;
}

/** Closes anything the model left open — long scenes get cut off mid-structure. */
function closeJSON(t){
  const stack=[];let inStr=false,esc2=false;
  for(let i=0;i<t.length;i++){
    const ch=t[i];
    if(inStr){ if(esc2)esc2=false; else if(ch==='\\')esc2=true; else if(ch==='"')inStr=false; continue; }
    if(ch==='"')inStr=true;
    else if(ch==='{'||ch==='[')stack.push(ch);
    else if(ch==='}'||ch===']')stack.pop();
  }
  let out=t;
  if(inStr)out+='"';
  // Drop a dangling key or comma left by the cut, then close what's still open.
  out=out.replace(/,\s*$/,'').replace(/[,{[]\s*"[^"]*"\s*:\s*$/,m=>m.replace(/[,]?\s*"[^"]*"\s*:\s*$/,''));
  while(stack.length)out+=stack.pop()==='{'?'}':']';
  return out;
}

/** Ollama's format:"json" always yields an object, so an array request comes back
    wrapped — {"lines":[...]}, {"nodes":[...]}, or occasionally a single bare item.
    Dig the array out rather than handing a non-array to the caller. */
/** Resolves whatever the model called a speaker to a real id, or rejects the line.
    Player aliases always resolve to the runtime id; drafting decides whether to keep them. */
function resolveSpeaker(raw,c){
  let sp=String(raw||'').trim();
  if(sp==='__narrator__')return sp;
  if(/^(narrat|narration|scene|stage|none|null|)$/i.test(sp))return '__narrator__';

  const byId=P.characters.find(x=>x.id===sp);
  const byName=P.characters.find(x=>x.name.toLowerCase()===sp.toLowerCase());
  const pc=playerChar();
  const hit=byId||byName;

  const meansPlayer=(hit&&isPlayer(hit))||/^(player|you|mc|protagonist)$/i.test(sp)||
    (pc&&sp.toLowerCase()===pc.name.toLowerCase());
  if(meansPlayer)
    // Kept when the writer wants drafted player dialogue; otherwise it belongs in a choice.
    return $('writePlayer')?.checked ? 'player' : null;

  if(hit)return hit.id;                       // a real character, even if not in cast yet
  const cast=(c.cast||[]).filter(id=>!isPlayer(chr(id)));
  return cast[0]||null;
}

function coerceArray(v){
  if(Array.isArray(v))return v;
  if(!v||typeof v!=='object')return [];
  // A wrapper object: take its first array-valued property.
  const arr=Object.values(v).find(x=>Array.isArray(x));
  if(arr)return arr;
  // A single item the model forgot to wrap.
  if(v.text||v.line||v.speaker||v.option)return [v];
  // {"0":{...},"1":{...}} — numeric keys in order.
  const keys=Object.keys(v);
  if(keys.length&&keys.every(k=>/^\d+$/.test(k)))
    return keys.sort((a,b)=>a-b).map(k=>v[k]);
  return [];
}

function harvest(raw,asObject){
  let t=String(raw).trim();
  // Fenced blocks, <think> preambles, and leading prose all show up in practice.
  t=t.replace(/<think>[\s\S]*?<\/think>/gi,'').trim();
  const fence=t.match(/```(?:json)?\s*([\s\S]*?)(?:```|$)/i);
  if(fence)t=fence[1].trim();

  // In array mode the payload may still be an object wrapper, so start at whichever
  // bracket comes first rather than assuming.
  const ai=t.indexOf('['),oi=t.indexOf('{');
  const useObj=asObject||(oi>=0&&(ai<0||oi<ai));
  const open=useObj?'{':'[',close=useObj?'}':']';
  const a=t.indexOf(open);
  if(a>0)t=t.slice(a);

  // Trailing prose is common, but so is truncation — try trimming to the last
  // closing bracket AND keeping everything, since only one works in each case.
  const b=t.lastIndexOf(close);
  const trimmed=(b>0&&b<t.length-1)?t.slice(0,b+1):null;

  const tries=[
    t,
    trimmed,
    closeJSON(t),
    // trailing commas and smart quotes
    closeJSON(t.replace(/,(\s*[}\]])/g,'$1')
      .replace(/[\u201C\u201D]/g,'"').replace(/[\u2018\u2019]/g,"'")),
    // raw newlines inside strings
    closeJSON(t.replace(/,(\s*[}\]])/g,'$1')
      .replace(/"((?:[^"\\]|\\.)*)"/g,(m,s)=>'"'+s.replace(/\n/g,' ')+'"'))
  ];
  let last;
  for(const attempt of tries){
    if(!attempt)continue;
    try{
      const v=JSON.parse(attempt);
      return asObject?v:coerceArray(v);
    }catch(e){ last=e; }
  }
  const err=new SyntaxError(last?last.message:'unparseable');
  err.raw=String(raw);
  throw err;
}

/** One call to Ollama. format:'json' constrains the model so it can't wander into prose. */
