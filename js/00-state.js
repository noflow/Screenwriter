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
/** The player character is whoever is flagged, else a sheet literally called "player". */
function isPlayer(c){return !!c&&(c.profile?.is_player===true||c.id==='player');}
function playerChar(){return P.characters.find(isPlayer)||null;}
const npcs=()=>P.characters.filter(c=>!isPlayer(c));
const chr=id=>id==='__narrator__'?NARRATOR:P.characters.find(c=>c.id===id);
const loc=id=>P.locations.find(l=>l.id===id);

let disk={get:()=>null,set:()=>{}};
try{localStorage.setItem('__t','1');localStorage.removeItem('__t');
 disk={get:()=>{try{return JSON.parse(localStorage.getItem('scenewright2'))}catch{return null}},
       set:v=>{try{localStorage.setItem('scenewright2',JSON.stringify(v))}catch{}}};}catch{}
const save=()=>{P.districts=DISTRICTS;P.travel=TRAVEL;P.aliases=ALIASES;disk.set(P);};
