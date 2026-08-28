/* ---- inspect UI ---- */
let insTab='lint';
function openInspect(tab){insTab=tab||insTab;paintInspect();$('inspect').showModal();}
$('closeInspect').onclick=()=>$('inspect').close();
document.querySelectorAll('[data-ins]').forEach(b=>b.onclick=()=>{
  insTab=b.dataset.ins;
  document.querySelectorAll('[data-ins]').forEach(x=>x.classList.toggle('on',x===b));
  paintInspect();});

function effectLedger(){
  const rows=[];
  walkAll((n,c,p,isOpt)=>{if(isOpt&&String(n.flag||'').trim())rows.push({scene:c.title||c.id,
    branch:n.text||'unnamed branch',effect:n.flag,where:p.join('.')});});
  return rows;
}

/** Checks the editable tree against Port Alder's .character conversation format.
    This is deliberately separate from the generic Godot contract: Port Alder
    reads named graph nodes and supports a defined list of branch conditions. */
function portAlderCheck(){
  const out=[],add=(sev,msg,where)=>out.push({sev,msg,where});
  const required=['format_version','id','display_name','profile','home','personality','schedule','skills',
    'goals','connections','relationship_defaults','boundaries','private_profile','relationship_chapters',
    'quest_hooks','conversation_topics','text_style','quests','conversations','text_messages','outcomes','asset_refs','entry_event'];
  const ids=new Set();
  npcs().forEach(c=>{
    const sheet=gameReady(c),name=c.name||c.id||'Unnamed character';
    required.filter(k=>sheet[k]===undefined).forEach(k=>add('err','Missing required .character field "'+k+'".',name));
    if(ids.has(c.id))add('err','Two character sheets use "'+c.id+'". Port Alder requires unique package ids.',name);
    ids.add(c.id);
  });
  const seen=new Set();
  P.content.filter(c=>c.type==='conversation').forEach(c=>{
    const name=c.title||c.id;
    const base=c.id.split('__')[0];
    if(seen.has(base))return;
    seen.add(base);
    const walk=(nodes,where)=>nodes.forEach(n=>{
      if(n.type==='gate'){
        if(!(n.options||[]).length)add('err','Automatic branch has no outcomes.',name);
        (n.options||[]).forEach((o,i)=>{
          if(!(o.requires||[]).length)add('warn','Automatic branch '+(i+1)+' has no condition, so it always wins when reached.',name);
          walk(o.nodes||[],where+' branch '+(i+1));
        });
      }else if(n.type==='choice'){
        (n.options||[]).forEach(o=>{
          walk(o.nodes||[],where+' choice');
        });
      }
    });
    walk(c.nodes||[],'scene');
  });
  if(npcs().length!==15)add('info','The current Port Alder vertical slice expects 15 NPC character packages; this project has '+npcs().length+'. The runtime Player is counted separately.', 'Character sheets');
  return out;
}
function branchTests(){
  const S=simState(),out=[];
  walkAll((n,c,p)=>{
    if(n.type!=='gate')return;
    const open=(n.options||[]).filter(o=>allMet(o.requires,S));
    out.push({scene:c.title||c.id,where:p.join('.'),open,total:n.options.length,
      sev:open.length===1?'ok':open.length?'warn':'err'});
  });
  return out;
}

function paintInspect(){
  const B=$('insBody');
  if(insTab==='portAlder'){
    const issues=portAlderCheck(),n=s=>issues.filter(i=>i.sev===s).length;
    B.innerHTML='<p class="hint">Checks the sheets and branching scenes against the Port Alder package and dialogue format before export.</p>'+
      (issues.length?'<div class="legend"><span style="color:var(--rose)">'+n('err')+' blocking</span><span>'+n('warn')+' warning'+(n('warn')===1?'':'s')+'</span><span>'+n('info')+' note'+(n('info')===1?'':'s')+'</span></div>'+issues.map(i=>
        '<div class="issue '+i.sev+'"><span class="sev">'+i.sev+'</span><span class="msg">'+esc(i.msg)+'<span class="where">'+esc(i.where)+'</span></span></div>').join(''):
        '<div class="clean">Ready for Port Alder export.<br>Every editable sheet and branch matches the supported format.</div>');
    return;
  }
  if(insTab==='effects'){
    const rows=effectLedger();
    B.innerHTML=rows.length?'<p class="hint">Every stat or flag change caused by a player choice or automatic outcome.</p>'+
      '<table class="regtable"><tr><th>Scene</th><th>Branch</th><th>Effects</th></tr>'+rows.map(r=>
        '<tr><td class="k">'+esc(r.scene)+'</td><td class="w">'+esc(r.branch)+'</td><td class="w">'+esc(r.effect)+'</td></tr>').join('')+'</table>'
      :'<div class="clean">No branch effects yet.</div>';
    return;
  }
  if(insTab==='milestones'){
    const rows=[];
    P.characters.forEach(c=>(c.relationship_chapters||[]).forEach(ch=>rows.push({name:c.name,
      level:ch.level,title:ch.title,needs:(ch.requires||[]).map(condLabel).join(' · ')||'—'})));
    const planned=P.content.filter(c=>c.scenePlan?.statGate).map(c=>{const g=c.scenePlan.statGate;
      return {name:chr(g.character)?.name||g.character,level:'stat',title:c.title||c.id,
        needs:g.key+' low ≤ '+(g.lowValue??g.value-1)+' · high ≥ '+g.value};});
    B.innerHTML='<p class="hint">Relationship chapters and planned stat thresholds in one place.</p><table class="regtable"><tr><th>Character</th><th>Milestone</th><th>Scene / chapter</th><th>Requirements</th></tr>'+
      rows.concat(planned).map(r=>'<tr><td class="k">'+esc(r.name)+'</td><td class="w">'+esc(r.level)+'</td><td class="w">'+esc(r.title)+'</td><td class="w">'+esc(r.needs)+'</td></tr>').join('')+'</table>';
    return;
  }
  if(insTab==='tests'){
    const tests=branchTests(),jumps=links().filter(l=>l.kind!=='chain').length;
    B.innerHTML='<div class="legend"><span>'+tests.length+' automatic branch'+(tests.length===1?'':'es')+'</span><span>'+jumps+' merge/jump link'+(jumps===1?'':'s')+'</span></div>'+
      (tests.length?tests.map(t=>'<div class="issue '+t.sev+'"><span class="sev">'+t.sev+'</span><span class="msg">'+esc(t.scene)+
        '<span class="where">gate '+esc(t.where)+' — '+t.open+' of '+t.total+' branches match the default starting state</span></span></div>').join('')
        :'<div class="clean">No automatic branches to test yet.</div>')+
      '<p class="hint" style="margin-top:12px">Use a jump node at the end of two branches to merge them into one shared passage. Validate also reports impossible combined stat conditions.</p>';
    return;
  }
  if(insTab==='lint'){
    const issues=validate();
    if(!issues.length){B.innerHTML='<div class="clean">Nothing to flag.<br>No dangling references, '+
      'no unreachable flags, no empty branches.</div>';return;}
    const n=s=>issues.filter(i=>i.sev===s).length;
    B.innerHTML='<div class="legend"><span>'+n('err')+' errors</span><span>'+n('warn')+
      ' warnings</span><span>'+n('info')+' notes</span></div>'+
      issues.map((i,j)=>'<div class="issue '+i.sev+'"><span class="sev">'+i.sev+'</span>'+
        '<span class="msg">'+esc(i.msg)+'<span class="where">'+esc(i.where)+'</span>'+
        (i.fix==='stubs'?'<button class="fix" data-fix="stubs">create stub sheets</button>':'')+
        '</span></div>').join('');
    B.querySelectorAll('[data-fix="stubs"]').forEach(b=>b.onclick=()=>{insTab='stub';
      document.querySelectorAll('[data-ins]').forEach(x=>x.classList.toggle('on',x.dataset.ins==='stub'));
      paintInspect();});
    return;
  }

  if(insTab==='reach'){
    const {rows,gates}=reachable();
    B.innerHTML=(gates.length
      ? '<div class="legend"><span style="color:var(--rose)">'+gates.length+
        ' gate'+(gates.length===1?'':'s')+' can never open</span></div>'+
        gates.map(g=>'<div class="issue err"><span class="sev">stuck</span><span class="msg">'+
          esc(g.key)+' needs '+g.need+' but the whole project can only reach '+g.max+
          ' — short by '+g.short+'.<span class="where">'+esc(g.where)+'</span></span></div>').join('')
      : '<div class="clean">Every stat gate is reachable.</div>')+
      '<p class="rubric later">Every meter</p><table class="regtable">'+
      '<tr><th>Meter</th><th>Starts</th><th>One-off gain</th><th>Per repeat</th>'+
      '<th>Loss</th><th>Ceiling</th></tr>'+
      rows.map(r=>'<tr><td class="k">'+esc(r.key)+'</td><td class="w">'+r.start+
        '</td><td class="w" style="color:var(--sage)">+'+r.gain+
        '</td><td class="w" style="color:var(--brass)">'+(r.perRun?'+'+r.perRun+' ×n':'—')+
        '</td><td class="w" style="color:var(--rose)">-'+r.spend+
        '</td><td class="k">'+(r.max===Infinity?'no cap':r.max)+'</td></tr>').join('')+'</table>'+
      (rows.some(r=>r.perRun)?'<p class="hint" style="margin-top:8px">Meters fed by a repeatable '+
        'activity have no ceiling — the player can grind them. Gates on those are always reachable, '+
        'but ask how many repeats you are really asking for.</p>':'');
    return;
  }

  if(insTab==='week'){
    const cells=weekGrid();
    B.innerHTML='<p class="hint" style="margin-bottom:10px">What can happen in each slot. '+
      'Empty evenings are dead time; crowded ones mean the player misses content.</p>'+
      '<table class="weekt"><tr><th></th>'+BLOCKS.map(b=>'<th>'+esc(pretty(b))+'</th>').join('')+'</tr>'+
      DAYS.map(d=>'<tr><th>'+esc(d.slice(0,3))+'</th>'+BLOCKS.map(b=>{
        const items=cells[d+'|'+b]||[];
        const free=P.characters.filter(c=>availability(c,d,b).free).length;
        return '<td class="'+(items.length?'has':'')+'">'+
          items.slice(0,4).map(i=>'<span class="wk '+i.type+'" title="'+esc(i.title||'')+'">'+
            esc((i.title||i.id).slice(0,16))+'</span>').join('')+
          (items.length>4?'<span class="wk more">+'+(items.length-4)+'</span>':'')+
          (!items.length?'<span class="wkfree">'+free+' free</span>':'')+'</td>';
      }).join('')+'</tr>').join('')+'</table>'+
      P.characters.map(c=>'<p class="rubric later">Where '+esc(c.name)+' is</p>'+
        '<table class="weekt"><tr><th></th>'+BLOCKS.map(b=>'<th>'+esc(pretty(b))+'</th>').join('')+'</tr>'+
        DAYS.map(d=>'<tr><th>'+esc(d.slice(0,3))+'</th>'+BLOCKS.map(b=>{
          const a=availability(c,d,b),where=a.where?placeName(a.where):'—';
          return '<td class="'+(a.free?'':'busycell')+'">'+
            '<span class="wk '+(a.free?'activity':'quest')+'">'+esc(where.slice(0,16))+'</span>'+
            '<span class="wkfree">'+esc(a.why.slice(0,18))+'</span></td>';
        }).join('')+'</tr>').join('')+'</table>').join('');
    return;
  }

  if(insTab==='sim'){
    const r=simulate(90);
    B.innerHTML='<div class="legend"><span>'+r.log.length+' beats played</span>'+
      '<span>over '+r.days+' day'+(r.days===1?'':'s')+'</span>'+
      '<span'+(r.stuck.length?' style="color:var(--rose)"':'')+'>'+r.stuck.length+' never reached</span></div>'+
      (r.stuck.length?'<p class="rubric">Never reached</p>'+
        r.stuck.map(s=>'<div class="issue '+(s.grindable?'warn':'err')+'"><span class="sev">'+
          (s.grindable?'slow':'stuck')+'</span><span class="msg">'+
          esc(s.item.title||s.item.id)+'<span class="where">'+esc(s.why)+'</span></span></div>').join('')
        :'<div class="clean">Every piece of content is reachable in a single playthrough.</div>')+
      '<p class="rubric later">Timeline</p>'+
      '<table class="regtable"><tr><th>Day</th><th>Block</th><th>What happened</th></tr>'+
      r.log.slice(0,60).map(l=>'<tr><td class="k">'+l.day+'</td><td class="w">'+esc(pretty(l.block))+
        '</td><td class="w"><span class="wk '+l.kind+'">'+esc(l.kind)+'</span> '+
        esc(l.what)+(l.n?' (repeat '+l.n+')':'')+'</td></tr>').join('')+'</table>'+
      (r.log.length>60?'<p class="hint">…'+(r.log.length-60)+' more</p>':'')+
      '<p class="rubric later">Meters at the end</p><table class="regtable">'+
      Object.entries(r.S.stats).filter(([k])=>!k.startsWith('activity.')).sort()
        .map(([k,v])=>'<tr><td class="k">'+esc(k)+'</td><td class="w">'+v+'</td></tr>').join('')+
      '</table>';
    return;
  }

  if(insTab==='reg'){
    const reg=flagRegistry(),emo=emotionRegistry();
    const rows=Object.keys(reg).sort().map(k=>{
      const r=reg[k],orphan=!r.sets.length||!r.reads.length;
      return '<tr'+(orphan?' class="orphan"':'')+'><td class="k">'+esc(k)+'</td>'+
        '<td class="w">'+(r.sets.join(', ')||'—')+'</td><td class="w">'+(r.reads.join(', ')||'—')+'</td></tr>';
    }).join('');
    const sprites=Object.keys(emo).map(id=>'<tr><td class="k">'+esc(chr(id)?.name||id)+'</td>'+
      '<td class="w" colspan="2">'+Object.entries(emo[id]).sort((a,b)=>b[1]-a[1])
      .map(([e,n])=>'<span class="pill">'+esc(e)+' ×'+n+'</span>').join('')+'</td></tr>').join('');
    B.innerHTML=(rows?'<table class="regtable"><tr><th>Flag</th><th>Set by</th><th>Read by</th></tr>'+
      rows+'</table>':'<p class="empty">No flags yet. Add one to a choice or a gate.</p>')+
      '<p class="rubric later">Sprite expressions needed</p>'+
      (sprites?'<table class="regtable">'+sprites+'</table>'
        :'<p class="empty">No emotions recorded yet — they come from generated lines.</p>');
    return;
  }

  if(insTab==='cov'){
    const cov=coverage();
    const max=Math.max(1,...Object.values(cov).map(c=>c.conv+c.quest+c.rep+c.texts));
    B.innerHTML='<div class="legend"><span><i style="background:var(--brass)"></i>conversation</span>'+
      '<span><i style="background:var(--sky)"></i>quest</span>'+
      '<span><i style="background:var(--sage)"></i>repeatable</span>'+
      '<span><i style="background:var(--rose)"></i>phone text</span></div>'+
      P.characters.map(c=>{
        const v=cov[c.id]||{conv:0,quest:0,rep:0,routes:0,texts:0},t=v.conv+v.quest+v.rep;
        const pc=x=>(x/max*100).toFixed(1)+'%';
        return '<div class="bar"><span class="nm">'+esc(c.name)+'</span>'+
          '<span class="track"><span class="fill" style="width:'+pc(v.conv)+';background:var(--brass)"></span>'+
          '<span class="fill" style="width:'+pc(v.quest)+';background:var(--sky)"></span>'+
          '<span class="fill" style="width:'+pc(v.rep)+';background:var(--sage)"></span>'+
          '<span class="fill" style="width:'+pc(v.texts)+';background:var(--rose)"></span></span>'+
          '<span class="num">'+t+' lines · '+v.texts+' texts</span></div>';
      }).join('')+
      '<p class="rubric later">By location</p>'+
      P.locations.map(l=>{
        const n=P.content.filter(c=>locPart(c.location)===l.id)
          .reduce((a,c)=>a+(c.type==='repeatable'?(c.lines||[]).length
            :c.type==='quest'?(c.stages||[]).reduce((m,s)=>m+countLines(s.nodes||[]),0)
            :countLines(c.nodes||[])),0);
        return '<div class="bar"><span class="nm">'+esc(l.name)+'</span>'+
          '<span class="track"><span class="fill" style="width:'+(n/max*100).toFixed(1)+
          '%;background:var(--ash)"></span></span><span class="num">'+n+' lines</span></div>';
      }).join('');
    return;
  }

  if(insTab==='godot'){
    const g=godotCheck(),R=g.registry;
    const acts=P.content.filter(c=>c.type==='activity').length;
    const rooms=P.content.filter(c=>roomPart(c.location)).length;
    const nocap=R.stats.filter(s=>s.max===null&&(s.read_by||[]).length).length;
    B.innerHTML=
      (g.fatal?'<div class="issue err" style="margin-bottom:12px"><span class="sev">blocked</span>'+
        '<span class="msg">'+g.fatal+' fatal mismatch'+(g.fatal===1?'':'es')+
        ' — the build would load and this content would never appear in play.'+
        '<span class="where">fix these before exporting</span></span></div>'
        :'<div class="clean" style="margin-bottom:12px">The export matches what the runtime reads.</div>')+
      '<table class="regtable"><tr><th>Flags</th><th>Meters</th><th>Counters</th>'+
      '<th>Room-scoped</th><th>Activities</th></tr><tr>'+
      '<td class="w">'+R.flags.length+'</td>'+
      '<td class="w">'+R.stats.length+(nocap?' <span class="pill">'+nocap+' uncapped</span>':'')+'</td>'+
      '<td class="w">'+R.counters.length+'</td>'+
      '<td class="w">'+rooms+'</td>'+
      '<td class="w">'+acts+'</td></tr></table>'+
      (g.issues.length
        ? '<p class="rubric later">Seam checks</p>'+
          g.issues.map(i=>'<div class="issue '+(i.sev==='fatal'?'err':i.sev)+'">'+
            '<span class="sev">'+i.sev+'</span><span class="msg">'+esc(i.msg)+
            '<span class="where">'+esc(i.where)+'</span></span></div>').join('')
        : '')+
      '<p class="rubric later">Declared state</p><table class="regtable">'+
      '<tr><th>Key</th><th>Type</th><th>Starts</th><th>Ceiling</th><th>Read by</th></tr>'+
      R.flags.concat(R.stats.map(s=>Object.assign({},s,{type:'meter'})),
        R.counters.map(c=>Object.assign({},c,{type:'counter'})))
        .map(x=>'<tr><td class="k">'+esc(x.key)+'</td><td class="w">'+x.type+
          '</td><td class="w">'+String(x.initial)+'</td><td class="w">'+
          (x.type==='meter'?(x.max===null?'<span style="color:var(--rose)">none</span>':x.max):'—')+
          '</td><td class="w">'+esc((x.read_by||[]).join(', ')||'—')+'</td></tr>').join('')+
      '</table>'+
      '<p class="hint" style="margin-top:8px">This is the registry block the export ships. '+
      'The runtime seeds and clamps from it, and warns on a key that is not in this table.</p>';
    return;
  }

  const miss=missingRefs();
  B.innerHTML=miss.length
    ? '<p class="hint" style="margin-bottom:12px">These ids appear in imported sheets but have no file of '+
      'their own. Creating stubs stops the model inventing personalities that contradict what you write later.</p>'+
      '<table class="regtable"><tr><th>Id</th><th>Referenced by</th><th>Inferred</th></tr>'+
      miss.map(m=>'<tr><td class="k">'+esc(m.id)+'</td><td class="w">'+esc(m.from.join(', '))+
        '</td><td class="w">'+esc([m.relation,m.residence,m.district].filter(Boolean).join(' · ')||'—')+
        '</td></tr>').join('')+'</table>'+
      '<div class="row" style="margin-top:14px;max-width:420px">'+
      '<button class="btn gold" id="mkStubs">Add all as stubs</button>'+
      '<button class="btn" id="dlStubs">Download sheets</button></div>'
    : '<div class="clean">Every referenced character has a sheet.</div>';

  if($('mkStubs'))$('mkStubs').onclick=()=>{
    miss.forEach(m=>importSheet(stubSheet(m)));save();paintAll();paintInspect();};
  if($('dlStubs'))$('dlStubs').onclick=()=>miss.forEach((m,i)=>setTimeout(()=>{
    const url=URL.createObjectURL(new Blob([JSON.stringify(stubSheet(m),null,2)],{type:'application/json'}));
    Object.assign(document.createElement('a'),{href:url,download:m.id+'.character'}).click();
    URL.revokeObjectURL(url);},i*250));
}
