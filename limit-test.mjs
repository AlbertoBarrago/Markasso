const url = 'ws://localhost:5173/session/ws?room=limitroom';
const open = () => new Promise((r,j)=>{const ws=new WebSocket(url);ws.onopen=()=>r(ws);ws.onerror=()=>j(new Error('open fail'));});
const a = await open(); const gotA=[]; a.onmessage=(e)=>gotA.push(JSON.parse(e.data));
const b = await open(); const gotB=[]; b.onmessage=(e)=>gotB.push(JSON.parse(e.data));
await new Promise(r=>setTimeout(r,200));
// A sends 215 commands rapidly (>200 cap)
for (let i=0;i<215;i++){
  a.send(JSON.stringify({type:'command',command:{type:'CREATE_ELEMENT',element:{id:'r'+i,type:'rect',x:i,y:0,width:2,height:2,strokeColor:'#000',fillColor:'transparent',strokeWidth:1,opacity:1,roughness:0}}}));
}
await new Promise(r=>setTimeout(r,500));
const appliedB = gotB.filter(m=>m.type==='apply').length;
console.log('B apply messages (capped at 200):', appliedB);
a.close();b.close();
