const HOST='http://localhost:11434',$=id=>document.getElementById(id);
const PAL=['#C9A227','#C4778E','#8FB08A','#7FA3C4','#C98F5B','#A98FC4','#C4B27F','#8FC4BC'];
const DAYS=['monday','tuesday','wednesday','thursday','friday','saturday','sunday'];
const BLOCKS=['early_morning','morning','lunch','afternoon','evening','late_evening','night'];

let P={characters:[],locations:[],content:[],districts:[],travel:null,aliases:{}};
let sel=null, selChar=null, selPlace=null, focusPath=[], stageIx=0;
let mode='play', busy=false, abort=null, fmt='sheets';

const slug=s=>String(s).toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'')||'x';
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const dress=s=>esc(s).replace(/\*([^*\n]+)\*/g,'<em class="dir">$1</em>');
const pretty=s=>String(s??'').replace(/_/g,' ');
const cur=()=>P.content.find(c=>c.uid===sel);
const NARRATOR={id:'__narrator__',name:'Narration',color:'#938599'};
/** Port Alder creates this person from the user's choices for every new save.
    It is an authoring reference, never a .character package. */
const RUNTIME_PLAYER=Object.freeze({
  id:'player',name:'Player',display_name:'Player',color:'#D7B46F',_runtime_player:true,
  profile:Object.freeze({is_player:true,role:'runtime_player',romance_eligible:false}),
  personality:Object.freeze({traits:[],values:[],social_style:''}),
  boundaries:Object.freeze({hard_limits:[]}),relationship_defaults:Object.freeze({})
});
const isRuntimePlayerId=id=>id==='player'||id==='__player__';
/** Legacy fixed-player sheets remain recognisable so they can be ignored on export. */
function isPlayer(c){return !!c&&(c._runtime_player===true||isRuntimePlayerId(c.id)||c.profile?.is_player===true);}
function playerChar(){return RUNTIME_PLAYER;}
const npcs=()=>P.characters.filter(c=>!isPlayer(c));
const authoredChr=id=>P.characters.find(c=>c.id===id)||null;
const chr=id=>id==='__narrator__'?NARRATOR:isRuntimePlayerId(id)?RUNTIME_PLAYER:authoredChr(id);
const loc=id=>P.locations.find(l=>l.id===id);

/** State-value shorthand used by imported Port Alder content: player.life_path=college. */
function stateScalar(raw){
  const value=String(raw??'').trim();
  if(value==='true')return true;
  if(value==='false')return false;
  if(value==='null')return null;
  if(/^-?(?:\d+|\d*\.\d+)$/.test(value))return Number(value);
  return value.replace(/^(["'])([\s\S]*)\1$/,'$2');
}
function stateAssignment(raw){
  const text=String(raw??'').trim(),at=text.indexOf('=');
  if(at<1)return null;
  const key=text.slice(0,at).trim();
  return key?{key,value:stateScalar(text.slice(at+1))}:null;
}
function stateValueText(value){
  if(value===null)return 'null';
  if(typeof value==='boolean'||typeof value==='number')return String(value);
  return String(value??'');
}

let disk={get:()=>null,set:()=>{}};
try{localStorage.setItem('__t','1');localStorage.removeItem('__t');
 disk={get:()=>{try{return JSON.parse(localStorage.getItem('scenewright2'))}catch{return null}},
       set:v=>{try{localStorage.setItem('scenewright2',JSON.stringify(v))}catch{}}};}catch{}
const save=()=>{P.districts=DISTRICTS;P.travel=TRAVEL;P.aliases=ALIASES;disk.set(P);};
