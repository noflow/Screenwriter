/* ---- objective completion editor ---- */
const COMPLETIONS=[
  ['conversation_completed','after a conversation',['conversation']],
  ['conversation_node_reached','at a point in a conversation',['conversation','node']],
  ['value_set','when a value is chosen',['key','allowed_values']],
  ['list_size_at_least','when a list reaches a size',['key','value']],
  ['meter_at_least','when a meter reaches a level',['character','meter','value']],
  ['quest_completed','after another quest',['quest']],
  ['item_acquired','when an item is obtained',['item']],
  ['days_elapsed','after N in-game days',['value']]
];

function completionEditor(s,owner){
  const c=s.completion||(s._authored&&s._authored.completion)||{event:'conversation_completed'};
  const spec=COMPLETIONS.find(x=>x[0]===c.event)||COMPLETIONS[0];
  const convs=P.content.filter(x=>x.type==='conversation');
  const field=f=>{
    const v=c[f]===undefined?'':(Array.isArray(c[f])?c[f].join(', '):c[f]);
    if(f==='conversation')return '<select data-cp="'+owner+':conversation">'+
      '<option value="">— pick —</option>'+convs.map(x=>'<option value="'+esc(x.id)+'"'+
      (x.id===c.conversation?' selected':'')+'>'+esc(x.title||x.id)+'</option>').join('')+'</select>';
    if(f==='quest')return '<select data-cp="'+owner+':quest">'+
      '<option value="">— pick —</option>'+P.content.filter(x=>x.type==='quest').map(x=>
      '<option value="'+esc(x.id)+'"'+(x.id===c.quest?' selected':'')+'>'+esc(x.title||x.id)+'</option>'
      ).join('')+'</select>';
    if(f==='character')return '<select data-cp="'+owner+':character">'+P.characters.map(x=>
      '<option value="'+esc(x.id)+'"'+(x.id===c.character?' selected':'')+'>'+esc(x.name)+'</option>'
      ).join('')+'</select>';
    const ph={node:'node id',key:'player.life_path',allowed_values:'college, employment',
      value:'2',meter:'trust',item:'front_door_key'}[f]||f;
    return '<input data-cp="'+owner+':'+f+'" value="'+esc(v)+'" placeholder="'+ph+'" '+
      'style="width:'+(f==='allowed_values'?150:f==='value'?52:112)+'px">';
  };
  return '<div class="compl"><span class="n">done</span>'+
    '<select data-cp="'+owner+':event">'+COMPLETIONS.map(x=>'<option value="'+x[0]+'"'+
      (x[0]===c.event?' selected':'')+'>'+x[1]+'</option>').join('')+'</select>'+
    spec[2].map(field).join('')+'</div>';
}

function wireCompletion(root){
  root.querySelectorAll('[data-cp]').forEach(el=>{
    const h2=()=>{
      const p=el.dataset.cp.split(':'),f=p.pop(),i=+p.pop(),c=cur();
      const s=c.stages[i];if(!s)return;
      s.completion=s.completion||Object.assign({event:'conversation_completed'},
        (s._authored&&s._authored.completion)||{});
      if(f==='event'){s.completion={event:el.value};}
      else if(f==='allowed_values')s.completion[f]=el.value.split(',').map(x=>x.trim()).filter(Boolean);
      else if(f==='value')s.completion[f]=parseInt(el.value,10)||0;
      else s.completion[f]=el.value;
      save();paintBody();
    };
    el.tagName==='SELECT'?el.onchange=h2:el.onblur=h2;
  });
}
