/* ============ conditions ============ */
const OPS=[['gte','≥'],['lte','≤'],['eq','='],['is_true','is set'],['is_false','is not set']];
const STAT_KEYS=['friendship','love','attraction','lust','trust','respect','resentment',
  'jealousy','comfort','commitment','satisfaction'];

function condLabel(r){
  const op=(OPS.find(o=>o[0]===r.op)||['','?'])[1];
  if(r.type==='chapter')return (chr(r.character)?.name||r.character)+' ch '+op+' '+r.value;
  if(r.type==='stat')  return (chr(r.character)?.name||r.character)+' '+r.key+' '+op+' '+r.value;
  if(r.type==='custom_stat')return (chr(r.character)?.name||r.character)+' '+(statDefinition(r.key)?.label||r.key)+' '+op+' '+r.value;
  if(r.type==='met')   return 'met '+(chr(r.character)?.name||r.character);
  if(r.type==='memory')return (chr(r.character)?.name||r.character)+' remembers '+r.key+(r.op==='is_false'?' (not yet)':'');
  const state=stateAssignment(r.key);
  if(state)return state.key+' = '+stateValueText(state.value)+(r.op==='is_false'?' (not)':'');
  return r.key+' '+op+(r.op==='is_true'||r.op==='is_false'?'':' '+r.value);
}

/** Evaluates one condition against a simulated or live state bag. */
function condMet(r,S){
  const num=v=>Number.isFinite(+v)?+v:0;
  let have;
  if(r.type==='chapter')   have=num(S.chapters[r.character]);
  else if(r.type==='stat') have=num(S.stats[r.character+'.'+r.key]);
  else if(r.type==='custom_stat')have=num(S.stats[r.character+'.'+r.key]);
  else if(r.type==='met')  return !!S.flags['met_'+r.character];
  else if(r.type==='memory'){
    const memories=S.memories?.[r.character]||[];
    const found=memories.includes(r.key);
    return r.op==='is_false'?!found:found;
  }
  else{
    const state=stateAssignment(r.key);
    if(state){
      const equal=S.flags[state.key]===state.value;
      return r.op==='is_false'?!equal:equal;
    }
    have=S.flags[r.key];
  }

  if(r.op==='is_true')  return have===true||num(have)>0;
  if(r.op==='is_false') return !(have===true||num(have)>0);
  const a=num(have),b=num(r.value);
  return r.op==='gte'?a>=b:r.op==='lte'?a<=b:a===b;
}
const allMet=(reqs,S)=>(reqs||[]).every(r=>condMet(r,S));

function condEditor(reqs,owner){
  return (reqs||[]).map((r,i)=>{
    const who=npcs().map(c=>'<option value="'+esc(c.id)+'"'+(c.id===r.character?' selected':'')+'>'+
      esc(c.name)+'</option>').join('');
    let mid='';
    if(r.type==='stat')mid='<select data-cf="'+owner+':'+i+':character">'+who+'</select>'+
      '<select data-cf="'+owner+':'+i+':key">'+STAT_KEYS.map(k=>'<option'+(k===r.key?' selected':'')+'>'+k+'</option>').join('')+'</select>';
    else if(r.type==='custom_stat')mid='<select data-cf="'+owner+':'+i+':character">'+who+'</select>'+
      '<select data-cf="'+owner+':'+i+':key">'+customStatDefs().map(s=>'<option value="'+s.id+'"'+(s.id===r.key?' selected':'')+'>'+esc(s.label)+'</option>').join('')+'</select>';
    else if(r.type==='chapter')mid='<select data-cf="'+owner+':'+i+':character">'+who+'</select>';
    else if(r.type==='met')mid='<select data-cf="'+owner+':'+i+':character">'+who+'</select>';
    else if(r.type==='memory')mid='<select data-cf="'+owner+':'+i+':character">'+who+'</select>'+
      '<input style="width:112px;text-align:left" data-cf="'+owner+':'+i+':key" value="'+esc(r.key||'memory_id')+'">';
    else mid='<input style="width:88px;text-align:left" data-cf="'+owner+':'+i+':key" value="'+esc(r.key||'')+'">';

    const ops=r.type==='met'?'':'<select data-cf="'+owner+':'+i+':op">'+
      OPS.filter(o=>r.type==='memory'?o[0].startsWith('is_'):r.type==='flag'||!o[0].startsWith('is_')).map(o=>
      '<option value="'+o[0]+'"'+(o[0]===r.op?' selected':'')+'>'+o[1]+'</option>').join('')+'</select>';
    const val=(r.type==='met'||r.type==='memory'||r.op==='is_true'||r.op==='is_false')?'':
      '<input data-cf="'+owner+':'+i+':value" value="'+esc(r.value??0)+'">';

    return '<span class="cond">'+(r.type==='met'?'met ':'')+mid+ops+val+
      '<button data-cx2="'+owner+':'+i+'">×</button></span>';
  }).join('')+
  '<button class="add" data-cadd="'+owner+':stat">+ stat</button>'+
  (customStatDefs().length?'<button class="add" data-cadd="'+owner+':custom_stat">+ custom stat</button>':'')+
  '<button class="add" data-cadd="'+owner+':chapter">+ chapter</button>'+
  '<button class="add" data-cadd="'+owner+':flag">+ flag / value</button>'+
  '<button class="add" data-cadd="'+owner+':met">+ met</button>'+
  '<button class="add" data-cadd="'+owner+':memory">+ memory</button>';
}

/** owner is "content", "stage:N", or a choice option path "opt:1.0" */
function reqsOf(owner){
  const c=cur();if(!c)return[];
  if(owner==='content')return c.requires=c.requires||[];
  if(owner.startsWith('stage:')){const s=c.stages[+owner.slice(6)];return s.requires=s.requires||[];}
  const o=optAt(owner.slice(4).split('.').map(Number));return o.requires=o.requires||[];
}

function wireConds(root){
  root.querySelectorAll('[data-cadd]').forEach(b=>b.onclick=()=>{
    const [owner,type]=b.dataset.cadd.split(':').slice(0,2).length===2&&b.dataset.cadd.startsWith('opt:')
      ? [b.dataset.cadd.slice(0,b.dataset.cadd.lastIndexOf(':')),b.dataset.cadd.split(':').pop()]
      : [b.dataset.cadd.slice(0,b.dataset.cadd.lastIndexOf(':')),b.dataset.cadd.split(':').pop()];
    const id=npcs()[0]?.id||'';
    reqsOf(owner).push(type==='stat'?{type:'stat',character:id,key:'love',op:'gte',value:50}
      :type==='custom_stat'?{type:'custom_stat',character:id,key:customStatDefs()[0]?.id||'',op:'gte',value:0}
      :type==='chapter'?{type:'chapter',character:id,op:'gte',value:2}
      :type==='met'?{type:'met',character:id}
      :type==='memory'?{type:'memory',character:id,key:'memory_id',op:'is_true',value:1}
      :{type:'flag',key:'new_flag',op:'is_true',value:1});
    save();paintSetup();paintBody();
  });
  root.querySelectorAll('[data-cx2]').forEach(b=>b.onclick=()=>{
    const s=b.dataset.cx2,i=+s.slice(s.lastIndexOf(':')+1),owner=s.slice(0,s.lastIndexOf(':'));
    reqsOf(owner).splice(i,1);save();paintSetup();paintBody();
  });
  root.querySelectorAll('[data-cf]').forEach(el=>{
    const h=()=>{const p=el.dataset.cf.split(':'),field=p.pop(),i=+p.pop(),owner=p.join(':');
      const r=reqsOf(owner)[i];if(!r)return;
      r[field]=field==='value'?(Number(el.value)||0):el.value;
      save();paintSetup();paintBody();};
    el.tagName==='SELECT'?el.onchange=h:el.onblur=h;
  });
}
