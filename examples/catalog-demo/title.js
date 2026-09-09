/** Original Akeru conformance fixture, MIT. No upstream game code or assets. */
const params=new URLSearchParams(location.hash.slice(1)),nonce=params.get('nonce'),shell=params.get('shell');
let sequence=0,received=-1,connected=false,paused=false,x=0,y=0,axes={},buttons={};
const status=document.querySelector('#status'),orb=document.querySelector('#orb');
const send=(type,payload)=>parent.postMessage({protocol:'akeru.catalog.v1',nonce,sequence:sequence++,type,payload},shell);
function reset(){axes={};buttons={};}
window.addEventListener('message',event=>{
  const m=event.data;
  if(event.source!==parent||event.origin!==shell||!m||m.protocol!=='akeru.catalog.v1'||m.nonce!==nonce||!Number.isSafeInteger(m.sequence)||m.sequence<=received)return;
  received=m.sequence;
  if(m.type==='connect'&&!connected&&m.payload?.sdkVersion==='0.1.0'){
    connected=true;status.textContent='Ready when you are.';send('playable',{sdkVersion:'0.1.0'});
  }else if(connected&&m.type==='input'&&!paused){axes=m.payload.axes;buttons=m.payload.buttons;status.textContent=`${m.payload.provider==='gamepad'?'Controller':'Touch'} input connected`;}
  else if(m.type==='pause'){paused=true;reset();status.textContent='Paused';}
  else if(m.type==='resume'){paused=false;reset();status.textContent='Ready when you are.';}
});
let previous=performance.now();function draw(at){const dt=Math.min(32,at-previous)/16;previous=at;if(connected&&!paused){x=Math.max(-120,Math.min(120,x+((axes.moveX??axes.leftX??0)+(buttons.right??0)-(buttons.left??0))*2*dt));y=Math.max(-65,Math.min(65,y+((axes.moveY??axes.leftY??0)+(buttons.down??0)-(buttons.up??0))*2*dt));orb.style.transform=`translate(${x}px, ${y}px)`;}requestAnimationFrame(draw);}requestAnimationFrame(draw);
