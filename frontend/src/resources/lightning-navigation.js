/* Explicit navigation between the separate Lightning experience and the hub. */
(() => {
  if (window.txTaxiLightningNavigate) return;
  const app = document.currentScript?.hasAttribute('data-lightning-app') || Boolean(window.__env?.LIGHTNING_EXPLORER);
  const local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const ease = 'cubic-bezier(.22,1,.36,1)';
  let leaving = false;
  function snapshot() {
    const layer = document.createElement('div');
    layer.className = 'lightning-navigation-surface';
    layer.inert = true; layer.setAttribute('aria-hidden', 'true');
    Object.assign(layer.style, {position:'fixed',inset:'0',overflow:'hidden',zIndex:'100001',pointerEvents:'none',background:getComputedStyle(document.body).backgroundColor || '#08090b'});
    const content = document.body.cloneNode(true);
    for (const node of content.querySelectorAll('script,.lightning-navigation-surface')) node.remove();
    content.removeAttribute('id');
    for (const node of content.querySelectorAll('[id]')) node.removeAttribute('id');
    const originals = document.body.querySelectorAll('canvas');
    [...content.querySelectorAll('canvas')].forEach((canvas, index) => {
      const original = originals[index]; if(!original) return;
      try {canvas.width=original.width; canvas.height=original.height; canvas.getContext('2d').drawImage(original,0,0);} catch {}
    });
    Object.assign(content.style, {position:'absolute',top:`-${scrollY}px`,left:'0',width:`${innerWidth}px`,margin:'0',pointerEvents:'none'});
    layer.append(content); document.documentElement.append(layer);
    return layer;
  }
  function hubHandoff() {
    const value = encodeURIComponent(JSON.stringify({chain:'btc',direction:'hub',at:Date.now()}));
    // The destination is the hub's existing Bitcoin band, never a Lightning block strip.
    document.cookie = `tx_taxi_handoff=${value}; Path=/; Max-Age=15; SameSite=Lax${local?'':'; Domain=tx.taxi; Secure'}`;
  }
  window.txTaxiLightningNavigate = async (destination, options = {}) => {
    if(leaving) return; leaving=true;
    const url = new URL(destination,location.origin);
    const callback=typeof options.navigate==='function'?options.navigate:()=>location.assign(url.href);
    const hub = url.pathname==='/' && (url.hostname==='tx.taxi' || url.hostname==='www.tx.taxi' || local && url.port==='4582');
    const layer = reduced.matches ? null : snapshot();
    try {
      if(layer) await layer.animate([{opacity:1,transform:'scale(1)'},{opacity:.08,transform:options.reverse?'scale(.97)':'scale(1.025)'}],{duration:320,easing:ease,fill:'forwards'}).finished;
      if(hub) hubHandoff();
      await callback();
      if(options.navigate && layer) {
        // Keep the actual page behind the cover until Angular paints its new route.
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        await layer.animate([{opacity:.08},{opacity:0}],{duration:120,easing:ease,fill:'forwards'}).finished;
        layer.remove(); leaving=false;
      }
    } catch {layer?.remove();leaving=false;}
  };
  if(!app) document.addEventListener('click',event=>{
    if(event.defaultPrevented || event.button!==0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link=event.composedPath().find(node=>node instanceof HTMLAnchorElement);
    if(!link || link.target==='_blank' || link.hasAttribute('download')) return;
    const url=new URL(link.href,location.origin);
    const lightning = url.origin==='https://lightning.btc.tx.taxi' || local && url.origin==='http://127.0.0.1:4581';
    if(!lightning) return;
    event.preventDefault(); window.txTaxiLightningNavigate(url.href);
  },true);
  addEventListener('pageshow',()=>{document.querySelectorAll('.lightning-navigation-surface').forEach(node=>node.remove());leaving=false;});
})();
