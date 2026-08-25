/* ---- schedule grid editor ---- */
let scIx=null,scSel=new Set(),scLast=null;

function openSchedule(i){
  scIx=i;scSel.clear();scLast=null;
  const c=P.characters[i];if(!c)return;
  $('scName').textContent=c.name+' — where they are';
  $('scLoc').innerHTML=placeOptions('');
  paintSchedule();
  $('sched').showModal();
}

function paintSchedule(){
  const c=P.characters[scIx];if(!c)return;
  const g=scheduleGrid(c);
  $('scGrid').innerHTML='<table class="sct"><tr><th class="corner"></th>'+
    BLOCKS.map(b=>'<th data-col="'+b+'">'+esc(pretty(b))+'</th>').join('')+'</tr>'+
    DAYS.map(d=>'<tr><th data-row="'+d+'">'+esc(d.slice(0,3))+'</th>'+
      BLOCKS.map(b=>{
        const k=d+'|'+b,v=g[k];
        return '<td data-k="'+k+'" class="'+(scSel.has(k)?'on ':'')+
          (v?'set ':'')+(v&&v.unavailable?'busy':'')+'">'+
          (v?'<span class="a">'+esc(pretty(v.activity||v.location))+'</span>'+
             (v.location?'<span class="l">'+esc(placeName(v.location))+'</span>':'')
            :'')+'</td>';
      }).join('')+'</tr>').join('')+'</table>';

  const G=$('scGrid');
  G.querySelectorAll('[data-k]').forEach(td=>td.onclick=e=>{
    const k=td.dataset.k;
    if(e.shiftKey&&scLast){
      // rectangular extend from the last click
      const [d1,b1]=scLast.split('|'),[d2,b2]=k.split('|');
      const dr=[DAYS.indexOf(d1),DAYS.indexOf(d2)].sort((x,y)=>x-y);
      const br=[BLOCKS.indexOf(b1),BLOCKS.indexOf(b2)].sort((x,y)=>x-y);
      for(let i=dr[0];i<=dr[1];i++)for(let j=br[0];j<=br[1];j++)scSel.add(DAYS[i]+'|'+BLOCKS[j]);
    }else{
      scSel.has(k)?scSel.delete(k):scSel.add(k);
      scLast=k;
    }
    paintSchedule();
  });
  G.querySelectorAll('[data-row]').forEach(th=>th.onclick=()=>{
    const d=th.dataset.row;
    const all=BLOCKS.every(b=>scSel.has(d+'|'+b));
    BLOCKS.forEach(b=>all?scSel.delete(d+'|'+b):scSel.add(d+'|'+b));
    paintSchedule();});
  G.querySelectorAll('[data-col]').forEach(th=>th.onclick=()=>{
    const b=th.dataset.col;
    const all=DAYS.every(d=>scSel.has(d+'|'+b));
    DAYS.forEach(d=>all?scSel.delete(d+'|'+b):scSel.add(d+'|'+b));
    paintSchedule();});

  $('scCount').textContent=scSel.size+' slot'+(scSel.size===1?'':'s');

  // Show what a single selected cell already holds, so Apply edits rather than blanks it.
  if(scSel.size===1){
    const v=g[[...scSel][0]];
    $('scLoc').value=v?.location||'';
    $('scAct').value=v?.activity||'';
    $('scBusy').checked=!!v?.unavailable;
  }
}

$('scApply').onclick=()=>{
  const c=P.characters[scIx];if(!c||!scSel.size)return;
  const g=scheduleGrid(c);
  const location=$('scLoc').value,activity=$('scAct').value.trim()||location;
  scSel.forEach(k=>{
    if(!location&&!activity)delete g[k];
    else g[k]={activity,location,unavailable:$('scBusy').checked};
  });
  setSchedule(c,g);paintSchedule();paintPresence();paintBody();
};
$('scClear').onclick=()=>{
  const c=P.characters[scIx];if(!c||!scSel.size)return;
  const g=scheduleGrid(c);
  scSel.forEach(k=>delete g[k]);
  setSchedule(c,g);paintSchedule();paintPresence();paintBody();
};
$('closeSched').onclick=()=>{$('sched').close();paintAll();};
