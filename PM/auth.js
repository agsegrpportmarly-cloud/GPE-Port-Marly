/* /auth.js — self-host SDK + statut */
(() => {
  const CFG = {
    domain: 'dev-zl3rulx7tauw5f4h.us.auth0.com',       // ex: dev-xxxxx.eu.auth0.com
    clientId: 'etdVdsWZQSoyQtrNdUKDRxytmXM4cZFL',
    redirectPath: '/adherents/',
    rolesClaim: 'https://pmarly/roles'
  };

  // 1er essai: fichier local self-hosté; pas de CDN nécessaire
  const SDK_URLS = [
    '/vendor/auth0-spa-js.production.js',
    // facultatif: CDNs en secours si un jour tu veux
    // 'https://cdn.auth0.com/js/auth0-spa-js/2.4/auth0-spa-js.production.js',
    // 'https://cdn.jsdelivr.net/npm/@auth0/auth0-spa-js@2/dist/auth0-spa-js.production.js',
    // 'https://unpkg.com/@auth0/auth0-spa-js@2/dist/auth0-spa-js.production.js'
  ];

  let auth0Client = null;

  function injectStyle(){
    if (document.getElementById('auth-cta-style')) return;
    const s=document.createElement('style'); s.id='auth-cta-style';
    s.textContent = `
      #auth-cta{position:fixed;top:12px;right:12px;z-index:9999;display:inline-block;padding:.45rem .9rem;border-radius:999px;font-weight:700;border:1px solid rgba(255,255,255,.6);background:rgba(0,0,0,.35);color:#fff;text-decoration:none;backdrop-filter:blur(4px);box-shadow:0 2px 10px rgba(0,0,0,.25);cursor:pointer;transition:.18s}
      #auth-cta[aria-disabled="true"]{opacity:.6;cursor:not-allowed}
      #auth-cta:hover{background:rgba(0,0,0,.5)}
      #auth-status{position:fixed;top:54px;right:16px;z-index:9999;padding:.25rem .5rem;border-radius:6px;font-size:12px;background:rgba(0,0,0,.35);color:#fff;border:1px solid rgba(255,255,255,.4);backdrop-filter:blur(4px)}
    `;
    document.head.appendChild(s);
  }
  function ensureBtn(){
    let b=document.getElementById('auth-cta');
    if(!b){ b=document.createElement('a'); b.id='auth-cta'; b.href='#'; b.textContent='Connexion…'; b.setAttribute('aria-disabled','true'); document.body.appendChild(b); }
    return b;
  }
  function setBtn(label,{disabled=false,onClick=null}={}){
    const b=ensureBtn(); b.textContent=label; b.setAttribute('aria-disabled', disabled?'true':'false'); b.onclick=null;
    if(!disabled && onClick){ b.onclick=(e)=>{e.preventDefault(); onClick();}; }
  }
  function setStatus(t){
    let el=document.getElementById('auth-status'); if(!el){ el=document.createElement('div'); el.id='auth-status'; document.body.appendChild(el); }
    el.textContent=t;
  }
  const show=(id,on=true)=>{ const el=document.getElementById(id); if(el) el.classList.toggle('hide',!on); };

  function loadScript(src, timeout=7000){
    return new Promise((res,rej)=>{
      const t=setTimeout(()=>rej(new Error('timeout')),timeout);
      const s=document.createElement('script'); s.src=src;
      s.onload=()=>{clearTimeout(t);res();};
      s.onerror=(e)=>{clearTimeout(t);rej(e);};
      document.head.appendChild(s);
    });
  }

  async function loadSdk(){
    if (typeof window.createAuth0Client==='function') return true;
    if (location.protocol==='file:'){ setStatus('file:// non supporté'); return false; }
    for (const url of SDK_URLS){
      try{
        setStatus('Chargement SDK…'); await loadScript(url);
        if (typeof window.createAuth0Client==='function'){ setStatus('SDK OK'); return true; }
      }catch(e){ console.warn('SDK fail',url,e); }
    }
    setStatus('SDK introuvable (self-host manquant ?)'); setBtn('Se connecter (indispo)', {disabled:true}); return false;
  }

  function applyRoles(roles){
    const any=Array.isArray(roles)&&roles.length>0;
    show('guest', !any);
    show('no-role', Array.isArray(roles)&&roles.length===0);
    show('app', any);
    if(any){
      document.getElementById('fs-general')?.classList.remove('hide');
      document.getElementById('fs-roles')?.classList.remove('hide');
      const rc=document.getElementById('role-cards');
      if(rc){
        const set=new Set(roles.map(r=>String(r).trim()));
        rc.querySelectorAll('.card').forEach(card=>{
          const need=(card.getAttribute('data-roles')||'').split(',').map(s=>s.trim()).filter(Boolean);
          card.style.display = need.length===0 || need.some(r=>set.has(r)) ? '' : 'none';
        });
      }
    }
  }

  async function render(){
    const isAuth=await auth0Client.isAuthenticated();
    if(!isAuth){
      setBtn('Se connecter',{onClick:async()=>{
        await auth0Client.loginWithRedirect({
          authorizationParams:{ redirect_uri:window.location.origin+CFG.redirectPath },
          appState:{ targetUrl: CFG.redirectPath }
        });
      }});
      show('guest',true); show('no-role',false); show('app',false);
      return;
    }
    setBtn('Se déconnecter',{onClick:async()=>{
      await auth0Client.logout({ logoutParams:{ returnTo: window.location.origin } });
    }});
    const user=await auth0Client.getUser();
    const w=document.getElementById('welcome'); if(w) w.textContent=`Bonjour ${user?.name||user?.email||'adhérent'} !`;
    const roles = user?.[CFG.rolesClaim] || user?.roles || [];
    applyRoles(Array.isArray(roles)?roles:[]);
  }

  async function init(){
    const ok = await loadSdk();
    if(!ok) return;
    auth0Client = await createAuth0Client({
      domain: CFG.domain,
      clientId: CFG.clientId,
      cacheLocation:'localstorage',
      useRefreshTokens:true,
      authorizationParams:{ redirect_uri: window.location.origin+CFG.redirectPath }
    });

    const p=new URLSearchParams(location.search);
    if(p.has('code') && p.has('state')){
      try{
        const { appState } = await auth0Client.handleRedirectCallback();
        history.replaceState({}, document.title, location.pathname);
        location.replace(appState?.targetUrl || CFG.redirectPath);
        return;
      }catch(e){ console.error('Callback Auth0', e); setStatus('Erreur callback'); }
    }
    await render();
  }

  document.addEventListener('DOMContentLoaded', async ()=>{
    injectStyle(); ensureBtn(); setBtn('Connexion…',{disabled:true});
    try{ await init(); }catch(e){ console.error('Init Auth',e); setStatus('Init erreur'); setBtn('Se connecter (indispo)',{disabled:true}); }
  });
})();
