/* ============ guided Port Alder character creator ============ */
const PA_METERS=['friendship','love','attraction','lust','trust','respect','resentment',
  'jealousy','comfort','commitment','compatibility','satisfaction'];

function creatorLocations(){
  const select=$('ccHome');
  const locations=P.locations.filter(l=>l&&l.id);
  select.innerHTML=locations.length
    ? locations.map(l=>'<option value="'+esc(l.id)+'">'+esc(l.name||pretty(l.id))+'</option>').join('')
    : '<option value="">Import locations first</option>';
  $('createCharacter').disabled=!locations.length;
  $('ccMessage').textContent=locations.length
    ? 'The weekday schedule is a safe starting point. Use Edit schedule to place their real work, classes, and free time.'
    : 'Import Port Alder locations before creating a character so their home is valid in the game.';
}

function creatorValue(id){return String($(id).value||'').trim();}
function clampInt(value,min,max,fallback){
  const n=parseInt(value,10);
  return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback;
}

function newPortAlderCharacter(){
  const displayName=creatorValue('ccName');
  const id=slug(displayName);
  if(!displayName)throw new Error('Give the character a display name first.');
  if(P.characters.some(c=>c.id===id))throw new Error('A character named "'+id+'" already exists.');
  const homeId=creatorValue('ccHome'),home=loc(homeId);
  if(!home)throw new Error('Choose a home from the imported Port Alder locations.');

  const age=clampInt(creatorValue('ccAge'),18,120,22);
  const friendship=clampInt(creatorValue('ccFriendship'),0,100,0);
  const romance=creatorValue('ccRomance')==='yes';
  const invitationThreshold=clampInt(creatorValue('ccInviteThreshold'),0,100,20);
  const preferredActivities=Array.from(document.querySelectorAll('[data-cc-social]:checked'))
    .map(input=>input.dataset.ccSocial);
  if(!preferredActivities.length)throw new Error('Choose at least one preferred non-romantic hangout.');
  const stats={friendship,love:0,attraction:0,lust:0,trust:friendship,
    respect:Math.min(friendship,25),resentment:0,jealousy:0,comfort:friendship,
    commitment:0,compatibility:Math.max(0,Math.min(50,friendship)),satisfaction:50};
  PA_METERS.forEach(key=>{if(!Number.isFinite(stats[key]))stats[key]=0;});
  const role=slug(creatorValue('ccRole')||'town_resident');
  const trait=slug(creatorValue('ccTrait1')||'friendly');
  const topic=slug(creatorValue('ccTopic1')||'city_life');
  const goal=slug(creatorValue('ccGoal')||'build_a_life_in_port_alder');
  const color=PAL[P.characters.length%PAL.length];
  const chapters=[
    ['first_meeting','First Meeting'],['getting_to_know_you','Getting to Know You'],
    ['a_shared_routine','A Shared Routine'],['trust_on_the_line','Trust on the Line'],
    ['a_place_in_each_others_lives','A Place in Each Other’s Lives']
  ].map((chapter,index)=>({level:index+1,id:id+'_'+chapter[0],title:chapter[1],route:'shared',
    story_plan:defaultRelationshipStoryPlan({home:{location_id:home.id}},index+1)}));
  const hardLimits=romance?['coercion','dishonesty']:['romance_with_player','sexual_content_with_player'];
  return {
    format_version:1,id,display_name:displayName,
    profile:{age,gender_identity:creatorValue('ccGender'),orientation:creatorValue('ccOrientation'),
      romance_eligible:romance,role,occupation:creatorValue('ccOccupation')||'Unemployed',education:''},
    home:{location_id:home.id,district:home.district||'',residence:home.name||pretty(home.id),household:['player']},
    identity:{pronouns:creatorValue('ccPronouns'),presentation:creatorValue('ccPresentation'),history:[]},
    characteristics:{likes:[],dislikes:[],fears:[],strengths:[]},
    custom_stats:Object.fromEntries(customStatDefs().map(s=>[s.id,s.default])),
    personality:{archetype:trait,traits:[trait],values:['community'],social_style:creatorValue('ccTone'),jealousy:0},
    schedule:{days_off:['saturday','sunday'],fixed_commitments:[{
      days:['monday','tuesday','wednesday','thursday','friday'],blocks:['morning','lunch','afternoon'],
      activity:'weekday_commitment',label:'Weekday commitment',location:home.id,unavailable:true
    }],preferred_social_blocks:['evening','late_evening']},
    home_routine:{actor_color:color.replace('#',''),default_by_block:{
      evening:{room:'',spawn:false,activity:'at_home',label:'At home'},
      late_evening:{room:'',spawn:false,activity:'relaxing',label:'Winding down'},
      night:{room:'',spawn:false,activity:'sleeping',label:'Asleep'}
    }},
    ambient_dialogue:[],skills:{},goals:[goal],connections:[],relationship_defaults:stats,
    social_preferences:{invitation_threshold:invitationThreshold,preferred_activities:preferredActivities},
    boundaries:{alcohol_consent:'never_when_impaired',hard_limits:hardLimits},
    private_profile:{knowledge:'hidden_until_relevant'},relationship_chapters:chapters,
    quest_hooks:[],conversation_topics:[topic],text_style:{tone:creatorValue('ccTone'),emoji_rate:'low',response_delay:'variable'},
    quests:[],conversations:[],text_messages:[],outcomes:[],asset_refs:{portraits:[],sprites:[],audio:[]},
    entry_event:''
  };
}

function openCharacterCreator(){creatorLocations();$('characterCreator').showModal();$('ccName').focus();}
$('openCharacterCreator').onclick=openCharacterCreator;
$('closeCharacterCreator').onclick=()=>$('characterCreator').close();
$('createCharacter').onclick=()=>{
  try{
    const sheet=newPortAlderCharacter();
    importSheet(sheet);
    selChar=P.characters.findIndex(c=>c.id===sheet.id);
    save();paintAll();$('characterCreator').close();openEditor(selChar);
    note('Created '+esc(sheet.display_name)+'. Fill in their details, then export their Port Alder sheet.');
  }catch(error){$('ccMessage').textContent=error.message;}
};
