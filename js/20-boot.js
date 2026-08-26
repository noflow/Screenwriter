/* ============ misc ============ */
const dial=(i,o,f)=>{const p=()=>o.value=f(i.value);i.addEventListener('input',p);p()};
dial($('temp'),$('tempOut'),v=>(+v).toFixed(2));
dial($('ctx'),$('ctxOut'),v=>(+v/1024)+'K');
dial($('burst'),$('burstOut'),v=>v);
$('go').onclick=run;
$('addLine').onclick=insertManualLine;
$('sayAs').onchange=()=>{const p=$('playAs'); if(p)p.value=$('sayAs').value;};
$('stop').onclick=()=>abort&&abort.abort();
$('line').addEventListener('keydown',e=>{
  if(e.key==='Enter'&&e.altKey){e.preventDefault();insertManualLine();return;}
  if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();run();}
});
$('line').addEventListener('input',e=>{e.target.style.height='auto';
  e.target.style.height=Math.min(e.target.scrollHeight,140)+'px';
  if(mode==='play')paintModes();});
$('railToggle').onclick=()=>$('rail').classList.toggle('open');
['useBounds','useAdult','useConn','writePlayer'].forEach(k=>$(k).onchange=()=>{save();paintBody();privacyWatch();});

function paintAll(){paintCast();paintSheet();paintPlaces();paintPlaceForm();paintContent();paintSetup();paintBody();paintSayAs();}

const stored=disk.get();
if(stored&&stored.characters){P=stored;
  DISTRICTS=P.districts||[];TRAVEL=P.travel||null;ALIASES=P.aliases||{};}
document.addEventListener('keydown',e=>{
  if(e.key!=='Escape')return;
  document.querySelectorAll('dialog[open]').forEach(d=>d.close());
});

paintAll();paintEngine();findModels();setInterval(findModels,30000);
try{localStorage.setItem('__t','1');localStorage.removeItem('__t');}
catch{note('This page can\'t save anything — browser storage is blocked. '+
  'Download the file and open it from <code>http://localhost:8000/</code> instead of previewing it.',true);}
