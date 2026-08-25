/* ============ ollama ============ */
async function findModels(){
  try{
    const r=await fetch(HOST+'/api/tags'); if(!r.ok)throw 0;
    const {models=[]}=await r.json(),s=$('model');s.innerHTML='';
    if(!models.length){s.innerHTML='<option>no models</option>';lamp('dark','no models');
      return raise('Ollama is running but has no models. Pull one: <code>ollama pull huihui_ai/dolphin3-abliterated:8b</code>');}
    models.sort((a,b)=>a.name.localeCompare(b.name)).forEach(m=>s.add(new Option(m.name,m.name)));
    const last=localStorage.getItem('scenewright.model');
    if(last&&models.some(m=>m.name===last))s.value=last;
    lamp('live','connected');clearAlarm();
  }catch{lamp('dark','no connection');$('model').innerHTML='<option>—</option>';
    raise('Can\'t reach Ollama. Check <code>ollama list</code>, and that you ran <code>setx OLLAMA_ORIGINS "*"</code> then restarted Ollama from the tray.');}
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
