/* ---- repeatable pool ---- */
function paintPool(c){
  c.lines=c.lines||[];
  const chapters=chr(c.character)?.relationship_chapters||[];
  $('treeInner').innerHTML=slugline(c)+
    (c.lines.length?'<div class="pool">'+c.lines.map((l,i)=>
      '<div class="pline"><input class="t" value="'+esc(l.text)+'" data-pt="'+i+'">'+
      '<input class="e" value="'+esc(l.emotion||'')+'" placeholder="emotion" data-pe="'+i+'">'+
      '<select class="c" data-pc="'+i+'"><option value="0">any ch</option>'+
        chapters.map(ch=>'<option value="'+ch.level+'"'+(+l.min_chapter===ch.level?' selected':'')+'>ch '+ch.level+'+</option>').join('')+
      '</select><button class="x" data-px="'+i+'">×</button></div>').join('')+'</div>'
    :'<div class="blank"><h2>No variants yet</h2><p>Repeatables are the lines a character says when you walk up '+
     'to them with nothing else going on. Generate a batch below — twenty variants is what keeps a sandbox from '+
     'feeling dead.</p></div>');
  $('treeInner').querySelectorAll('[data-pt]').forEach(el=>el.oninput=()=>{c.lines[+el.dataset.pt].text=el.value;save()});
  $('treeInner').querySelectorAll('[data-pe]').forEach(el=>el.oninput=()=>{c.lines[+el.dataset.pe].emotion=el.value;save()});
  $('treeInner').querySelectorAll('[data-pc]').forEach(el=>el.onchange=()=>{c.lines[+el.dataset.pc].min_chapter=+el.value;save()});
  $('treeInner').querySelectorAll('[data-px]').forEach(b=>b.onclick=()=>{c.lines.splice(+b.dataset.px,1);save();paintBody()});
  $('counter').textContent=c.lines.length+' variants';paintModes();
}
