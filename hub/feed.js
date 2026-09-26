/** Chain-owned native explorer transport; snapshot age and stream liveness are distinct. */
export function startFeed({onSnapshot,onStatus,signal}) {
 const endpoint='wss://xmr.tx.taxi/api/v1/ws';
 let socket,retry,watchdog,initial,lastMessage=0,lastData=0,attempt=0,stopped=false,haveData=false;
 const status=(state,error)=>onStatus?.({state,updatedAt:lastData||null,error});
 const block=value=>value && typeof value==='object' && Number.isSafeInteger(value.height) && typeof value.id==='string';
 function connect(){
  if(stopped)return;
  status(haveData?'stale':'loading');
  const current=socket=new WebSocket(endpoint);
  let receivedData=false;
  initial=setTimeout(()=>{if(!receivedData && !stopped)current.close();},25000);
  current.onopen=()=>{current.send(JSON.stringify({action:'init'}));current.send(JSON.stringify({action:'want',data:['blocks','mempool-blocks','stats']}));};
  current.onmessage=event=>{
   if(stopped || socket!==current)return;
   let data;try{data=JSON.parse(event.data)}catch{return;}
   if(!data || typeof data!=='object' || Array.isArray(data))return;
   lastMessage=Date.now();
   const snapshot={};
   if(Array.isArray(data.blocks) && data.blocks.every(block))snapshot.blocks=[...data.blocks].reverse();
   else if(block(data.block))snapshot.block=data.block;
   if(Array.isArray(data['mempool-blocks']))snapshot.mempoolBlocks=data['mempool-blocks'];
   if(data.da && typeof data.da==='object')snapshot.difficultyAdjustment=data.da;
   const hasData=Object.hasOwn(snapshot,'blocks') || Object.hasOwn(snapshot,'block') || Object.hasOwn(snapshot,'mempoolBlocks');
   if(hasData){
    haveData=true;receivedData=true;lastData=lastMessage;attempt=0;clearTimeout(initial);
    onSnapshot(snapshot);
   }
   // Regular stats keep a loaded, quiet chain live; they cannot initialize an empty view.
   status(haveData && receivedData?'live':haveData?'stale':'loading');
  };
  current.onerror=()=>{};
  current.onclose=()=>{
   clearTimeout(initial);
   if(stopped || socket!==current)return;
   status(haveData?'stale':'unavailable','Explorer stream interrupted');
   retry=setTimeout(connect,Math.min(30000,1000*2**Math.min(attempt++,5)));
  };
 }
 watchdog=setInterval(()=>{if(lastMessage && Date.now()-lastMessage>45000 && socket?.readyState===1){status(haveData?'stale':'unavailable','Explorer stream silent');socket.close();}},5000);
 function stop(){stopped=true;clearTimeout(retry);clearTimeout(initial);clearInterval(watchdog);if(socket){socket.onmessage=null;socket.onclose=null;socket.close();}signal?.removeEventListener('abort',stop);}
 if(signal?.aborted)stop();else{signal?.addEventListener('abort',stop,{once:true});connect();}
 return stop;
}
