/* Shared navigation handoff. No entrance animation; only explicit chain switches. */
(() => {
  const script = document.currentScript;
  const profiles = [{"chain":"btc","coin":"bitcoin","background":"#08090b","port":4341,"origin":"https://btc.tx.taxi","icon":"/assets/chains/bitcoin.png"},{"chain":"eth","coin":"ethereum","background":"#070812","port":4342,"origin":"https://eth.tx.taxi","icon":"/assets/chains/ethereum.png"},{"chain":"xmr","coin":"monero","background":"#000000","port":4343,"origin":"https://xmr.tx.taxi","icon":"/assets/chains/monero.png"},{"chain":"ltc","coin":"litecoin","background":"#0d1018","port":4344,"origin":"https://ltc.tx.taxi","icon":"/assets/chains/litecoin.png"}];
  const source = script?.dataset.chain;
  const local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const cookieName = 'tx_taxi_handoff';
  let leaving = false, layer, animations = [];
  const ease = 'cubic-bezier(.22,1,.36,1)';
  function cookie(value) {
    document.cookie = `${cookieName}=${value}; Path=/; Max-Age=${value ? 15 : 0}; SameSite=Lax${local ? '' : '; Domain=tx.taxi; Secure'}`;
  }
  function surface(profile, marker) {
    const element = document.createElement('div');
    element.className = 'taxi-navigation-surface';
    element.setAttribute('aria-hidden', 'true');
    Object.assign(element.style, {position:'fixed',inset:'0',background:profile.background,zIndex:'100000',pointerEvents:'none',transformOrigin:'top',overflow:'hidden'});
    const icon = document.createElement('img'); icon.src = source ? `/resources/branding/${profile.coin}-divider.png` : `/assets/chains/${profile.coin}.png`; icon.alt = '';
    Object.assign(icon.style,{position:'absolute',left:marker ? `${marker.x*innerWidth}px` : '50%',top:marker ? `${marker.y}px` : innerWidth<768?'232px':'201px',width:'34px',height:'34px',transform:'translate(-50%,-50%)'});
    element.append(icon);
    return element;
  }
  function reset() { leaving=false; animations.forEach(a=>a.cancel()); animations=[]; layer?.remove();layer=null;document.querySelectorAll('[data-taxi-departing]').forEach(e=>{e.style.removeProperty('transform');e.style.removeProperty('z-index');e.removeAttribute('data-taxi-departing');}); }
  // Runs in the destination head before its first paint, only after an explicit handoff.
  try {
    const value=document.cookie.split('; ').find(c=>c.startsWith(cookieName+'='))?.slice(cookieName.length+1);
    const handoff=value?JSON.parse(decodeURIComponent(value)):null;
    if(source && handoff?.chain===source && Date.now()-handoff.at<15000 && Date.now()>=handoff.at){
      cookie('');
      const profile=profiles.find(p=>p.chain===source);
      if(profile){
        document.documentElement.style.background=profile.background;
        layer=surface(profile,handoff.marker);document.documentElement.append(layer);
        let done=false;
        const reveal=()=>{if(done)return;done=true;observer.disconnect();clearTimeout(fallback);requestAnimationFrame(()=>requestAnimationFrame(()=>{if(!layer)return;if(reduced.matches){reset();return;}const icon=layer.firstElementChild;const target=document.querySelector('.chain-divider-mark img')?.getBoundingClientRect();if(target){const start=icon.getBoundingClientRect();icon.animate([{translate:'0 0'},{translate:`${target.x-start.x}px ${target.y-start.y}px`}],{duration:180,easing:ease,fill:'forwards'});}const animation=layer.animate([{opacity:1},{opacity:0}],{duration:180,easing:ease});animation.finished.finally(reset);}));};
        const observer=new MutationObserver(()=>{if(document.querySelector('app-root .navbar') && document.querySelector('app-root #divider'))reveal();});
        observer.observe(document.documentElement,{childList:true,subtree:true});
        const fallback=setTimeout(reveal,8000);
        window.addEventListener('pagehide',()=>{observer.disconnect();clearTimeout(fallback);},{once:true});
      }
    }
  } catch { cookie(''); }
  async function depart(url, profile, band) {
    if(leaving)return;leaving=true;
    if(local)url=new URL(url.pathname+url.search+url.hash,`http://127.0.0.1:${profile.port}`);
    const nativeMark=document.querySelector('.chain-divider-mark img')?.getBoundingClientRect();
    const marker=nativeMark?{x:(nativeMark.x+nativeMark.width/2)/innerWidth,y:nativeMark.y+nativeMark.height/2}:{x:.5,y:(document.querySelector('.hub-navbar')?.getBoundingClientRect().height||76)+125};
    cookie(encodeURIComponent(JSON.stringify({chain:profile.chain,at:Date.now(),marker})));
    if(reduced.matches){location.assign(url.href);return;}
    layer=surface(profile,marker);
    document.documentElement.append(layer);
    const rect=band?.getBoundingClientRect();
    if(rect){
      // Expand the band's existing surface; keep its real strip above the expanding plane.
      layer.firstElementChild.style.opacity='0';
      animations.push(layer.animate([{transform:`translateY(${rect.y}px) scaleY(${260/innerHeight})`},{transform:'translateY(0) scaleY(1)'}],{duration:400,easing:ease,fill:'forwards'}));
      band.dataset.taxiDeparting='';band.style.zIndex='100001';
      const nav=document.querySelector('.hub-navbar')?.getBoundingClientRect().height||76;
      animations.push(band.animate([{transform:'translateY(0)'},{transform:`translateY(${nav-rect.y}px)`}],{duration:400,easing:ease,fill:'forwards'}));
      const identity=band.querySelector('.hub-chain-identity');
      if(identity)animations.push(identity.animate([{opacity:1},{opacity:0}],{duration:220,fill:'forwards'}));
    }else{
      animations.push(layer.animate([{opacity:0},{opacity:1}],{duration:220,easing:ease,fill:'forwards'}));
    }
    try{await Promise.all(animations.map(a=>a.finished));}catch{return;}
    // Retain the final surface until the browser replaces this document.
    location.assign(url.href);
  }
  document.addEventListener('click',event=>{
    if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;
    const link=event.composedPath().find(n=>n instanceof HTMLAnchorElement);
    if(!link||link.target==='_blank'||link.hasAttribute('download'))return;
    let url;try{url=new URL(link.href);}catch{return;}
    const profile=profiles.find(p=>url.origin===p.origin || local&&url.origin===`http://127.0.0.1:${p.port}`);
    if(!profile||profile.chain===source||url.protocol!=='https:'&&!local)return;
    // Entity links remain immediate. Only explicit explorer switching opens a chain surface.
    if(url.pathname!=='/'||url.search||url.hash)return;
    event.preventDefault();
    const band=[...document.querySelectorAll('.hub-band')].find(b=>b.querySelector('tx-native-strip')?.dataset.destination===profile.origin+'/');
    depart(url,profile,band);
  });
  window.addEventListener('pageshow',event=>{if(event.persisted)reset();});

})();
