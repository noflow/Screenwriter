/* ============ engines ============
   Ollama stays the default and the only local one. Anything OpenAI-compatible —
   Pawan.Krd, a self-hosted proxy, an OpenRouter-shaped endpoint — speaks the same
   request and response shapes, so one adapter covers all of them. */
const ENGINES={
  ollama:{label:'Ollama — on this machine',base:HOST,openai:false,local:true},
  pawan:{label:'Pawan.Krd — hosted',base:'https://api.pawan.krd/v1',openai:true,
    requiresKey:true,note:'OpenAI-compatible. Create an API key in your Pawan.Krd dashboard, then choose a chat model.'},
  cosmosrp:{label:'Pawan.Krd · CosmosRP 3.5',base:'https://api.pawan.krd/v1',openai:true,
    requiresKey:true,defaultModel:'pkrd/cosmosrp-3.5',
    note:'Their dedicated roleplay model. Requires a Pawan.Krd API key; good for dialogue, weaker on strict JSON.'},
  custom:{label:'Other OpenAI-compatible',base:'',openai:true,
    note:'Any endpoint that answers /chat/completions the way OpenAI does.'}
};

/* Engine settings live in localStorage, never in P — a key must not ride along
   in a saved project file or an exported sheet. */
let AI={engine:'ollama',base:'',key:'',models:''};
try{Object.assign(AI,JSON.parse(localStorage.getItem('scenewright.ai')||'{}'));}catch{}
const engine=()=>ENGINES[AI.engine]||ENGINES.ollama;
const aiBase=()=>String((AI.engine==='custom'?AI.base:'')||engine().base||'').replace(/\/+$/,'');
const isLocalEngine=()=>!!engine().local;
const saveAI=()=>{try{localStorage.setItem('scenewright.ai',JSON.stringify(AI))}catch{}};
function aiHeaders(){
  const h={'Content-Type':'application/json'};
  if(engine().openai&&AI.key)h.Authorization='Bearer '+AI.key;
  return h;
}

async function findModels(){
  const s=$('model');
  const remember=()=>{const last=localStorage.getItem('scenewright.model');
    const preferred=engine().defaultModel;
    if(preferred&&[...s.options].some(x=>x.value===preferred)){s.value=preferred;return;}
    if(last&&[...s.options].some(x=>x.value===last))s.value=last;};
  const typed=()=>{
    const list=engine().defaultModel?[engine().defaultModel]
      :String(AI.models||'').split(',').map(x=>x.trim()).filter(Boolean);
    s.innerHTML='';
    if(!list.length){s.innerHTML='<option>—</option>';return false;}
    list.forEach(m=>s.add(new Option(m,m)));
    return true;
  };

  if(engine().openai){
    if(!aiBase()){lamp('dark','no endpoint');typed();
      return raise('That engine needs a base URL. Set one in the Direction tab.');}
    if(engine().requiresKey&&!AI.key){s.innerHTML='<option value="">enter API key</option>';
      lamp('dark','API key needed');
      return raise('Pawan.Krd needs an API key. Create one in its dashboard, then paste it in the Direction tab.');}
    try{
      const r=await fetch(aiBase()+'/models',{headers:aiHeaders()});
      if(!r.ok)throw new Error('HTTP '+r.status);
      const d=await r.json();
      const ids=[...new Set((d.data||d.models||[]).map(m=>m.id||m.name).filter(Boolean))].sort();
      if(!ids.length)throw new Error('the endpoint listed no models');
      s.innerHTML='';ids.forEach(m=>s.add(new Option(m,m)));
      remember();lamp('live','connected');clearAlarm();
    }catch(e){
      // Plenty of proxies don't expose /models at all. A typed list works fine.
      if(typed()){remember();lamp('live','manual list');clearAlarm();}
      else{lamp('dark','no model list');
        raise('Could not list models from <code>'+esc(aiBase())+'</code> — '+esc(e.message)+
          '.<br>Type the model names you want in the Direction tab and they will be used as given.');}
    }
    return;
  }

  try{
    const r=await fetch(aiBase()+'/api/tags'); if(!r.ok)throw 0;
    const {models=[]}=await r.json();s.innerHTML='';
    if(!models.length){s.innerHTML='<option>no models</option>';lamp('dark','no models');
      return raise('Ollama is running but has no models. Pull one: <code>ollama pull huihui_ai/dolphin3-abliterated:8b</code>');}
    models.sort((a,b)=>a.name.localeCompare(b.name)).forEach(m=>s.add(new Option(m.name,m.name)));
    remember();
    lamp('live','connected');clearAlarm();
  }catch{lamp('dark','no connection');s.innerHTML='<option>—</option>';
    raise('Can\'t reach Ollama. Check <code>ollama list</code>, and that you ran <code>setx OLLAMA_ORIGINS "*"</code> then restarted Ollama from the tray.'+
      '<br>Or switch to a hosted engine in the Direction tab.');}
}

/** One generation call against whichever engine is selected. Returns raw text. */
async function chatComplete(prompt,signal,json){
  if(engine().requiresKey&&!AI.key)
    throw new Error(engine().label+' needs an API key. Add one in the Direction tab.');
  const model=$('model').value;
  const temp=parseFloat($('temp').value);
  const ctx=parseInt($('ctx').value,10);

  if(!engine().openai){
    const res=await fetch(aiBase()+'/api/chat',{method:'POST',signal,headers:aiHeaders(),
      body:JSON.stringify({model,stream:false,
        messages:[{role:'user',content:prompt}],
        format:json?'json':undefined,
        options:{temperature:temp,num_ctx:ctx,num_predict:2048,
          repeat_penalty:1.22,repeat_last_n:256}})});
    if(!res.ok)throw new Error('Ollama returned '+res.status);
    return (await res.json()).message?.content||'';
  }

  const send=async withFormat=>{
    const body={model,stream:false,temperature:temp,max_tokens:2048,
      frequency_penalty:.35,presence_penalty:.15,
      messages:[{role:'user',content:prompt}]};
    if(withFormat&&json)body.response_format={type:'json_object'};
    const res=await fetch(aiBase()+'/chat/completions',{method:'POST',signal,
      headers:aiHeaders(),body:JSON.stringify(body)});
    if(!res.ok){
      const text=await res.text().catch(()=>'');
      const err=new Error(engine().label+' returned '+res.status+
        (res.status===401?' — the API key was rejected':'')+
        (text?': '+text.slice(0,160):''));
      err.status=res.status;throw err;
    }
    const d=await res.json();
    return d.choices?.[0]?.message?.content||d.choices?.[0]?.text||'';
  };

  try{ return await send(true); }
  catch(e){
    // Not every proxy honours response_format, and the prompt already demands JSON.
    if(json&&(e.status===400||e.status===422||e.status===404))return await send(false);
    throw e;
  }
}

function paintEngine(){
  const s=$('engine');if(!s)return;
  if(!s.options.length)Object.keys(ENGINES).forEach(k=>s.add(new Option(ENGINES[k].label,k)));
  s.value=AI.engine;
  const e=engine();
  $('engineNote').textContent=e.local
    ? 'Nothing leaves this machine.'
    : (e.note||'');
  $('baseField').style.display=AI.engine==='custom'?'':'none';
  $('keyField').style.display=e.openai?'':'none';
  $('modelsField').style.display=e.openai&&!e.defaultModel?'':'none';
  $('aiBase').value=AI.base||'';
  $('aiKey').value=AI.key||'';
  $('aiModels').value=AI.models||'';
  $('engineHost').textContent=e.local?'local':aiBase().replace(/^https?:\/\//,'');
  privacyWatch();
}

/** The tool's promise is that nothing leaves the machine. If that stops being
    true, say so — especially with the private profile switched on. */
function privacyWatch(){
  if(!isLocalEngine()&&$('useAdult')?.checked)
    note('<b>Private profile is on and generation is remote.</b> The private_profile block '+
      'is being sent to '+esc(engine().label)+'. Switch the engine back to Ollama, or that '+
      'checkbox off, if you would rather it stayed here.',true);
}

const lamp=(c,t)=>{$('lamp').className='lamp '+c;$('lampText').textContent=t;};
const raise=h=>{const a=$('alarmSlot');
  const keep=a.querySelector('.note');
  a.innerHTML='<div class="alarm">'+h+'</div>';
  if(keep)a.appendChild(keep);};
const clearAlarm=()=>{const a=$('alarmSlot'),keep=a.querySelector('.note');
  a.innerHTML='';if(keep)a.appendChild(keep);};
/** Import feedback — survives the connection banner repainting. */
function note(msg,bad){
  const a=$('alarmSlot');
  a.querySelector('.note')?.remove();
  const d=document.createElement('div');
  d.className='alarm note';
  if(!bad)d.style.cssText='background:rgba(143,176,138,.11);border-color:rgba(143,176,138,.45)';
  d.innerHTML=msg;
  a.appendChild(d);
  if(!bad)setTimeout(()=>d.remove(),6000);
}
$('model').onchange=e=>{try{localStorage.setItem('scenewright.model',e.target.value)}catch{}};
$('engine').onchange=()=>{AI.engine=$('engine').value;saveAI();paintEngine();findModels();};
$('aiBase').onchange=()=>{AI.base=$('aiBase').value.trim();saveAI();findModels();};
$('aiKey').onchange=()=>{AI.key=$('aiKey').value.trim();saveAI();findModels();};
$('aiModels').onchange=()=>{AI.models=$('aiModels').value;saveAI();findModels();};
$('forgetKey').onclick=()=>{
  AI.key='';saveAI();$('aiKey').value='';
  note('Saved API key removed from this browser.');
  findModels();
};
