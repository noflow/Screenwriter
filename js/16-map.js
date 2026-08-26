/* ============ story map ============ */
let mapZ=1,mapX=0,mapY=0,linkFrom=null,mapSel=null;

/** Map identities use uid: quest and activity ids intentionally may be the same. */
function mapItem(key){return P.content.find(c=>c.uid===key);}

/** A saved map link remembers the exact card while the authored jump keeps its id. */
function mapJumpTarget(n){
  return mapItem(n._map_target_uid)||P.content.find(c=>c.type==='conversation'&&c.id===n.target)||
    P.content.find(c=>c.id===n.target);
}

/** Every link between content items, from jump nodes anywhere in a tree. */
function links(){
  const out=[];
  const scan=(list,c,via)=>list.forEach(n=>{
    if(n.type==='jump'&&n.target){
      const target=mapJumpTarget(n);
      if(target)out.push({from:c.uid,to:target.uid,target:n.target,node:n,
        label:via?.text||'',reqs:via?.requires||[]});
    }
    if(n.type==='choice'||n.type==='gate')n.options.forEach(o=>scan(o.nodes,c,o));
  });
  P.content.forEach(c=>{
    if(c.type==='quest'||c.type==='activity')(c.stages||[]).forEach(s=>scan(s.nodes||[],c,null));
    else if(c.type!=='repeatable')scan(c.nodes||[],c,null);
  });
  // A quest chain is a link even though no jump node expresses it.
  P.content.forEach(c=>{
    const previous=c.type==='quest'&&c.after
      ?P.content.find(x=>x.type==='quest'&&x.id===c.after):null;
    if(previous)out.push({from:previous.uid,to:c.uid,label:'then',reqs:[],chain:true});
  });
  return out;
}

function passHeight(c){return c.requires?.length?86:72;}

/** Parallel edges between the same two cards get spread apart, or their labels collide. */
function edgeGeom(l,rank,total){
  const a=mapItem(l.from),b=mapItem(l.to);
  if(!a||!b)return null;
  const spread=(rank-(total-1)/2);
  const ay=(a.y||0)+passHeight(a)/2+spread*24;
  const by=(b.y||0)+passHeight(b)/2+spread*12;
  const ax=(a.x||0)+186, bx=(b.x||0);
  const back=bx<ax;
  const lift=44+Math.abs(spread)*34;
  const dx=Math.max(46,Math.abs(bx-ax)*.45);
  const d=back
    ? 'M'+ax+' '+ay+' C'+(ax+70)+' '+(ay-lift)+' '+(bx-70)+' '+(by-lift)+' '+bx+' '+by
    : 'M'+ax+' '+ay+' C'+(ax+dx)+' '+ay+' '+(bx-dx)+' '+by+' '+bx+' '+by;
  // Stagger the sample point too, so sibling labels differ in x as well as y.
  const t=Math.max(.22,Math.min(.78,.5+spread*0.16)),mt=1-t;
  const c1x=back?ax+70:ax+dx, c1y=back?ay-lift:ay;
  const c2x=back?bx-70:bx-dx, c2y=back?by-lift:by;
  const mx=mt*mt*mt*ax+3*mt*mt*t*c1x+3*mt*t*t*c2x+t*t*t*bx;
  let my=mt*mt*mt*ay+3*mt*mt*t*c1y+3*mt*t*t*c2y+t*t*t*by;
  // Sampling the curve clusters labels wherever it is steep, so for parallel edges
  // guarantee the vertical step instead of trusting the geometry. Each label still
  // gets a distinct x from the staggered sample point, so it stays next to its line.
  if(total>1)my=((a.y||0)+passHeight(a)/2+(b.y||0)+passHeight(b)/2)/2+spread*20;
  return {d,mx,my};
}

/** Groups edges by endpoint pair and hands each its rank within the group. */
function rankEdges(L){
  const bucket={};
  L.forEach(l=>{const k=l.from+'|'+l.to;(bucket[k]=bucket[k]||[]).push(l);});
  return L.map(l=>{
    const g=bucket[l.from+'|'+l.to];
    return {l,rank:g.indexOf(l),total:g.length};
  });
}

/** Label with a backing plate so it stays readable over lines and the grid. */
function edgeLabel(text,mx,my,cls){
  const t=String(text).slice(0,34)+(String(text).length>34?'…':'');
  const w=t.length*5.3+12;
  return '<g class="lblg"><rect x="'+(mx-w/2)+'" y="'+(my-8)+'" width="'+w+'" height="14" rx="7"/>'+
    '<text class="'+cls+'" x="'+mx+'" y="'+(my+2)+'" text-anchor="middle">'+esc(t)+'</text></g>';
}

/** Layered layout: start passages on the left, each hop one column right. */
function autoLayout(){
  const L=links(),inbound={};
  L.forEach(l=>inbound[l.to]=(inbound[l.to]||0)+1);
  const roots=P.content.filter(c=>!inbound[c.uid]||c.start);
  const depth={},seen=new Set();
  let layer=roots.length?roots:P.content.slice(0,1),d=0;
  while(layer.length&&d<40){
    const next=[];
    layer.forEach(c=>{
      if(!c||seen.has(c.uid))return;
      seen.add(c.uid);depth[c.uid]=d;
      L.filter(l=>l.from===c.uid).forEach(l=>{
        const t=mapItem(l.to);
        if(t&&!seen.has(t.uid))next.push(t);});
    });
    layer=next;d++;
  }
  P.content.filter(c=>!seen.has(c.uid)).forEach(c=>depth[c.uid]=d);
  const rows={};
  P.content.forEach(c=>{
    const col=depth[c.uid]||0;rows[col]=rows[col]||0;
    c.x=60+col*330;c.y=40+rows[col]*126;rows[col]++;
  });
  save();paintMap();
}

function openMap(){
  if(P.content.some(c=>c.x===undefined))autoLayout();
  paintMap();$('map').showModal();
}
$('closeMap').onclick=()=>{$('map').close();linkFrom=null;};
$('mpLayout').onclick=autoLayout;
$('mpNew').onclick=()=>{
  const uid='u'+Date.now().toString(36)+Math.random().toString(36).slice(2,5);
  P.content.push({uid,type:'conversation',id:'scene_'+(P.content.length+1),title:'New passage',
    location:P.locations[0]?.id||'',day:'monday',block:'evening',chapter:1,cast:[],
    requires:[],nodes:[],x:60-mapX/mapZ+40,y:60-mapY/mapZ+40});
  sel=uid;save();paintMap();paintAll();
};
$('mpLink').onclick=()=>{
  $('mapWrap').classList.toggle('linking');
  linkFrom=null;
  $('mpHint').textContent=$('mapWrap').classList.contains('linking')
    ? 'click the source passage, then the target'
    : 'drag to move · scroll to zoom · click a card to open it';
  paintMap();
};

function paintMap(){
  const cards=$('mapCards'),svg=$('mapEdges'),L=links();
  const inbound={};L.forEach(l=>inbound[l.to]=(inbound[l.to]||0)+1);

  cards.innerHTML=P.content.map(c=>{
    const n=c.type==='repeatable'?(c.lines||[]).length+' variants'
      :c.type==='quest'?(c.stages||[]).length+' stages'
      :c.type==='activity'?Math.max(0,(c.stages||[]).length-1)+' milestones'
      :countLines(c.nodes||[])+' lines · '+routes(c.nodes||[],[]).length+' routes';
    return '<div class="pass '+c.type+(inbound[c.uid]?'':' orphan')+(sel===c.uid?' sel':'')+
      (linkFrom===c.uid?' linksrc':'')+'" data-m="'+c.uid+'" '+
      'style="left:'+(c.x||0)+'px;top:'+(c.y||0)+'px">'+
      (c.start?'<span class="start">START</span>':'')+
      '<div class="ttl">'+esc(c.title||c.id)+'</div>'+
      '<div class="meta">'+esc(loc(c.location)?.name||'no location')+'<br>'+esc(n)+'</div>'+
      (c.requires?.length?'<span class="gate">if '+esc(c.requires.map(condLabel).join(' · '))+'</span>':'')+
      '<button class="port" data-port="'+c.uid+'">→</button></div>';
  }).join('');

  const W=Math.max(1200,...P.content.map(c=>(c.x||0)+400));
  const H=Math.max(700,...P.content.map(c=>(c.y||0)+220));
  svg.setAttribute('width',W);svg.setAttribute('height',H);

  svg.innerHTML='<defs><marker id="ar" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">'+
    '<path d="M0 0 L8 3 L0 6 Z" fill="#938599"/></marker></defs>'+
    rankEdges(L).map((e,i)=>{
      const g=edgeGeom(e.l,e.rank,e.total);
      if(!g)return '';
      const gate=e.l.reqs.length?e.l.reqs.map(condLabel).join(' · '):'';
      return '<path class="edge'+(e.l.chain?' chain':'')+'" d="'+g.d+
        '" marker-end="url(#ar)" data-e="'+i+'"></path>'+
        (e.l.label?edgeLabel(e.l.label,g.mx,g.my-(gate?8:0),'edgelbl'):'')+
        (gate?edgeLabel(gate,g.mx,g.my+(e.l.label?8:0),'edgegate'):'');
    }).join('');

  $('mapCanvas').style.transform='translate('+mapX+'px,'+mapY+'px) scale('+mapZ+')';
  wireMap(L);
}

function wireMap(L){
  const wrap=$('mapWrap');

  $('mapCards').querySelectorAll('.pass').forEach(el=>{
    const c=P.content.find(x=>x.uid===el.dataset.m);
    let drag=null;

    el.onmousedown=e=>{
      if(e.target.dataset.port!==undefined)return;
      if(wrap.classList.contains('linking'))return;
      e.stopPropagation();
      drag={sx:e.clientX,sy:e.clientY,ox:c.x||0,oy:c.y||0,moved:false};
      el.classList.add('dragging');
      const move=ev=>{
        if(!drag)return;
        const dx=(ev.clientX-drag.sx)/mapZ,dy=(ev.clientY-drag.sy)/mapZ;
        if(Math.abs(dx)>3||Math.abs(dy)>3)drag.moved=true;
        c.x=Math.round(drag.ox+dx);c.y=Math.round(drag.oy+dy);
        el.style.left=c.x+'px';el.style.top=c.y+'px';
        paintEdgesOnly();
      };
      const up=()=>{
        document.removeEventListener('mousemove',move);
        document.removeEventListener('mouseup',up);
        el.classList.remove('dragging');
        if(drag&&!drag.moved){sel=c.uid;focusPath=[];stageIx=0;$('map').close();paintAll();}
        else save();
        drag=null;
      };
      document.addEventListener('mousemove',move);
      document.addEventListener('mouseup',up);
    };

    el.onclick=e=>{
      if(!wrap.classList.contains('linking'))return;
      e.stopPropagation();
      if(!linkFrom){linkFrom=c.uid;paintMap();return;}
      if(linkFrom===c.uid){linkFrom=null;paintMap();return;}
      const src=P.content.find(x=>x.uid===linkFrom);
      if(src&&src.type==='quest'&&c.type==='quest'){c.after=src.id;linkFrom=null;save();paintMap();return;}
      if(src&&src.type!=='repeatable'){
        const list=(src.type==='quest'||src.type==='activity')
          ?(src.stages[src.stages.length-1].nodes=src.stages[src.stages.length-1].nodes||[])
          :(src.nodes=src.nodes||[]);
        list.push({type:'jump',target:c.id,_map_target_uid:c.uid});
      }
      linkFrom=null;save();paintMap();
    };
  });

  $('mapCards').querySelectorAll('[data-port]').forEach(b=>b.onclick=e=>{
    e.stopPropagation();
    wrap.classList.add('linking');
    linkFrom=b.dataset.port;
    $('mpHint').textContent='now click the target passage';
    paintMap();
  });

  $('mapEdges').querySelectorAll('[data-e]').forEach(p=>{
    p.style.pointerEvents='stroke';
    p.onclick=e=>{
      e.stopPropagation();
      const l=L[+p.dataset.e];
      if(l.chain){
        const t=mapItem(l.to);
        if(t){t.after='';save();paintMap();}
        return;
      }
      const src=mapItem(l.from);
      if(!src)return;
      const strip=list=>{
        for(let i=list.length-1;i>=0;i--){
          if(list[i]===l.node){list.splice(i,1);return true;}
          if(list[i].type==='choice'||list[i].type==='gate')
            for(const o of list[i].options)if(strip(o.nodes))return true;
        }
        return false;
      };
      if(src.type==='quest'||src.type==='activity')(src.stages||[]).some(s=>strip(s.nodes||[]));
      else strip(src.nodes||[]);
      save();paintMap();
    };
  });

  wrap.onmousedown=e=>{
    if(e.target.closest('.pass'))return;
    if(wrap.classList.contains('linking')){linkFrom=null;paintMap();return;}
    const sx=e.clientX-mapX,sy=e.clientY-mapY;
    wrap.classList.add('panning');
    const move=ev=>{mapX=ev.clientX-sx;mapY=ev.clientY-sy;
      $('mapCanvas').style.transform='translate('+mapX+'px,'+mapY+'px) scale('+mapZ+')';};
    const up=()=>{wrap.classList.remove('panning');
      document.removeEventListener('mousemove',move);document.removeEventListener('mouseup',up);};
    document.addEventListener('mousemove',move);
    document.addEventListener('mouseup',up);
  };

  wrap.onwheel=e=>{
    e.preventDefault();
    const r=wrap.getBoundingClientRect(),px=e.clientX-r.left,py=e.clientY-r.top;
    const next=Math.min(2,Math.max(.3,mapZ*(e.deltaY<0?1.12:.89)));
    mapX=px-(px-mapX)*(next/mapZ);mapY=py-(py-mapY)*(next/mapZ);
    mapZ=next;
    $('mapCanvas').style.transform='translate('+mapX+'px,'+mapY+'px) scale('+mapZ+')';
  };
}

/** Redraw only the arrows during a drag — cheap enough to run per mousemove. */
function paintEdgesOnly(){
  const ranked=rankEdges(links()),svg=$('mapEdges');
  const groups=svg.querySelectorAll('.lblg');
  let gi=0;
  svg.querySelectorAll('[data-e]').forEach((p,i)=>{
    const e=ranked[i];if(!e)return;
    const g=edgeGeom(e.l,e.rank,e.total);if(!g)return;
    p.setAttribute('d',g.d);
    const gate=e.l.reqs.length?1:0;
    const move=(node,dy)=>{
      if(!node)return;
      const r=node.querySelector('rect'),t=node.querySelector('text');
      const w=+r.getAttribute('width');
      r.setAttribute('x',g.mx-w/2);r.setAttribute('y',g.my-8+dy);
      t.setAttribute('x',g.mx);t.setAttribute('y',g.my+2+dy);
    };
    if(e.l.label)move(groups[gi++],gate?-8:0);
    if(gate)move(groups[gi++],e.l.label?8:0);
  });
}

function authoredNote(d){
  if(!(d.quests||[]).length&&!(d.conversations||[]).length&&!(d.activities||[]).length)return '';
  const r=importAuthored(d);
  const bits=[];
  if(r.quests.length)bits.push(r.quests.length+' quest'+(r.quests.length===1?'':'s'));
  if(r.activities.length)bits.push(r.activities.length+' activit'+(r.activities.length===1?'y':'ies'));
  if(r.conversations.length)bits.push(r.conversations.length+' conversation'+(r.conversations.length===1?'':'s'));
  if(r.messages)bits.push(r.messages+' text message'+(r.messages===1?'':'s')+' kept');
  if(r.skipped.length)bits.push(r.skipped.length+' skipped');
  return bits.length?' — with '+bits.join(', '):'';
}
