/* ============ modes ============ */
function paintModes(){
  const c=cur(),bar=$('modeBar');
  if(!c){
    mode='scene';
    bar.innerHTML='<button class="mode on" data-mode="scene">Whole scene</button>'+
      '<button class="mode" id="openPlanner">Plan scene</button>'+
      '<span class="as">describe a scene and it will be written as a new conversation</span>';
    $('line').placeholder='Describe the scene — "mom is in the living room in the evening '+
      'watching TV, player starts a conversation and she asks if he wants to join her"…';
    $('go').textContent='Write the scene';
    $('openPlanner').onclick=openPlanner;
    return;
  }
  const m=c.type==='repeatable'
    ? [['variants','Write variants']]
    : [['scene','Whole scene'],['chat','Long chat'],['play','Play a part'],['direct','Direct'],['choice','Write choices']];
  if(!m.some(x=>x[0]===mode))mode=m[0][0];
  const dangling=c.type!=='repeatable'?emptyBranches().length:0;
  bar.innerHTML=m.map(([k,l])=>'<button class="mode'+(mode===k?' on':'')+'" data-mode="'+k+'">'+l+'</button>').join('')+
    (c.type==='conversation'?'<button class="mode" id="openPlanner">Plan scene</button>':'')+
    (dangling?'<button class="mode fill" id="fillEmpty">Continue '+dangling+
      ' unfinished branch'+(dangling===1?'':'es')+'</button>':'')+
    (c.type!=='repeatable'?'<span class="as">as <select id="playAs">'+
      // The player comes first — Play-a-part means playing the player by default.
      (playerChar()
        ? '<option value="'+esc(playerChar().id)+'">'+esc(playerChar().name)+' (player)</option>'
        : '<option value="__player__">Player</option>')+
      (c.cast||[]).filter(id=>!isPlayer(chr(id))).map(id=>
        '<option value="'+esc(id)+'">'+esc(chr(id)?.name||id)+'</option>').join('')+
      '</select></span>':'');
  bar.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.mode;paintModes();});
  if($('openPlanner'))$('openPlanner').onclick=openPlanner;
  if($('fillEmpty'))$('fillEmpty').onclick=fillEmpty;
  $('line').placeholder = mode==='scene'
      ? 'Describe the scene — "mom is in the living room in the evening watching TV, player starts a conversation and she asks if he wants to join her"…'
    : mode==='chat'
      ? 'Optional direction — leave empty to just continue the conversation, or nudge the tone/topic…'
    : mode==='play'?($('writePlayer')?.checked
        ? 'Speak as your character — or leave this empty and press Take my turn…'
        : 'Speak as your character, or *do something*…')
    : mode==='direct'?'Stage note — "Theo deflects, then gives more than he meant to"…'
    : mode==='choice'?'Optional: what the player is weighing…'
    : 'Optional: a situation these lines cover — "player walks up while he\'s working"…';
  const empty=!$('line').value.trim();
  $('go').textContent = mode==='scene'?'Write the scene'
    :mode==='chat'?'Continue chat'
    :mode==='choice'?'Fork':mode==='variants'?'Generate'
    :(mode==='play'&&empty&&$('writePlayer')?.checked)?'Take my turn':'Write';
  paintSayAs();
}
