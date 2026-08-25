/* ============ node tree ============ */
function rootList(){
  const c=cur(); if(!c)return[];
  if(c.type==='quest'||c.type==='activity') return c.stages[stageIx]?.nodes||[];
  if(c.type==='repeatable') return [];
  return c.nodes;
}
function listAt(p){let l=rootList();for(let i=0;i<p.length;i+=2)l=l[p[i]].options[p[i+1]].nodes;return l;}
const nodeAt=p=>listAt(p.slice(0,-1))[p[p.length-1]];
const optAt=p=>listAt(p.slice(0,-2))[p[p.length-2]].options[p[p.length-1]];
function transcriptAt(p){
  const out=[];let l=rootList();
  for(let i=0;i<p.length;i+=2){
    l.slice(0,p[i]).forEach(n=>{if(n.type==='line')out.push(n)});
    const o=l[p[i]].options[p[i+1]];out.push({speaker:'__c__',text:o.text});l=o.nodes;
  }
  l.forEach(n=>{if(n.type==='line')out.push(n)});
  return out;
}
const countLines=l=>l.reduce((n,x)=>n+(x.type==='line'?1:x.type==='jump'?0:x.options.reduce((m,o)=>m+countLines(o.nodes),0)),0);
