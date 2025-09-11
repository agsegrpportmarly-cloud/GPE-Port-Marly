/* /PM/auth.js — charge le SDK depuis /PM/vendor/ automatiquement */
(() => {
  const CFG = {
    domain: 'dev-zl3rulx7tauw5f4h.us.auth0.com',       // ex: dev-xxxxx.eu.auth0.com
    clientId: 'etdVdsWZQSoyQtrNdUKDRxytmXM4cZFL',
    redirectPath: '/adherents/',
    rolesClaim: 'https://pmarly/roles'
  };

  let auth0Client = null;

  // ---------- UI (bouton + statut) ----------
  function css(){ if(document.getElementById('auth-cta-style')) return;
    const s=document.createElement('style'); s.id='auth-cta-style'; s.textContent=`
      #auth-cta{position:fixed;top:12px;right:12px;z-index:9999;display:inline-block;padding:.45rem .9rem;border-radius:999px;font-weight:700;border:1px solid rgba(255,255,255,.6);background:rgba(0,0,0,.35);color:#fff;text-decoration:none;backdrop-filter:blur(4px);box-shadow:0 2px 10px rgba(0,0,0,.25);cursor:pointer;transition:.18s}
      #auth-cta[aria-disabled="true"]{opacity:.6;cursor:not-allowed}
      #auth-cta:hover{background:rgba(0,0,0,.5)}
      #auth-status{position:fixed;top:54px;right:16px;z-index:9999;padding:.25rem .5rem;border-radius:6px;font-size:12px;background:rgba(0,0,0,.35);color:#fff;border:1px solid rgba(255,255,255,.4);backdrop-filter:blur(4px)}
    `; document.head.appendChild(s); }
  function btn(){ let b=document.getElementById('auth-cta');
    if(!b){ b=document.createElement('a'); b.id='auth-cta'; b.href='#'; b.textContent='Connexion…'; b.setAttribute('aria-disabled','true'); document.body.appendChild(b); }
    return b; }
  function setBtn(label,{disabled=false,onClick=null}={}){ const b=btn(); b.textContent=label; b.setAttribute('aria-disabled',disabled?'true':'false'); b.onclick=null; if(!disabled && onClick){ b.onclick=(e)=>{e.preventDefault(); onClick();}; } }
  function status(t){ let el=document.getElementById('auth-status'); if(!el){ el=document.createElement('div'); el.id='auth-status'; document.body.appendChild(el); } el.textContent=t; }
  const show=(id,on=true)=>{ const el=document.getElementById(id); if(el) el.classList.toggle('hide',!on); };

  // ---------- Résolution AUTOMATIQUE du chemin vendor ----------
  function vendorCandidates(){
    const out = new Set();
    // 1) basé sur l'emplacement réel de auth.js (fiable)
    const self = document.currentScript || [...document.scripts].find(s => (s.src||'').includes('/auth.js'));
    if (self && self.src) {
      const base = new URL(self.src);
      base.pathname = base.pathname.replace(/[^/]+$/, ''); // dossier de auth.js (ex: /PM/)
      out.add(new URL('vendor/auth0-spa-js.production.js', base).href);     // /PM/vendor/...
      out.add(new URL('../vendor/auth0-spa-js.production.js', base).href);  // selon la page
    }
    // 2) relatif à la page courante
    out.add(new URL('../vendor/auth0-spa-js.production.js', location.href).href);
    // 3) absolus possibles selon publish dir
    out.add(location.origin + '/vendor/auth0-spa-js.production.js');  // si PM est la racine publiée
    out.add(location.origin + '/PM/vendor/auth0-spa-js.production.js'); // si le site expose /PM/
    return [...out];
  }

  function loadScript(src, timeout=8000){
    return new Promise((res,rej)=>{
      const t=setTimeout(()=>rej(new Error('timeout')),timeout);
      const s=document.createElement('script'); s.src=src;
      s.onload=()=>{clearTimeout(t);res();};
      s.onerror=(e)=>{clearTimeout(t);rej(e);};
      document.head.appendChild(s);
    });
  }

  async function loadSdk(){
    if(typeof window.createAuth0Client==='function') return true;
    if(location.protocol==='file:'){ status('file:// non supporté'); return false; }
    for(const url of vendorCandidates()){
      try{ status('Chargement SDK…'); await loadScript(url);
        if(typeof window.createAuth0Client==='function'){ status('SDK OK'); return true; }
      }catch(e){ /* continue */ }
    }
    status('SDK introuvable (chemin local)'); setBtn('Se connecter (indispo)', {disabled:true}); return false;
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
          authorizationParams:{ redirect_uri: window.location.origin+CFG.redirectPath },
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
    const ok=await loadSdk(); if(!ok) return;
    auth0Client = await createAuth0Client({
      domain: CFG.domain, clientId: CFG.clientId,
      cacheLocation:'localstorage', useRefreshTokens:true,
      authorizationParams:{ redirect_uri: window.location.origin+CFG.redirectPath }
    });

    const p=new URLSearchParams(location.search);
    if(p.has('code') && p.has('state')){
      try{
        const { appState } = await auth0Client.handleRedirectCallback();
        history.replaceState({}, document.title, location.pathname);
        location.replace(appState?.targetUrl || CFG.redirectPath);
        return;
      }catch(e){ console.error('Callback Auth0', e); status('Erreur callback'); }
    }
    await render();
  }

  document.addEventListener('DOMContentLoaded', async ()=>{
    css(); btn(); setBtn('Connexion…',{disabled:true});
    try{ await init(); }catch(e){ console.error('Init Auth', e); status('Init erreur'); setBtn('Se connecter (indispo)', {disabled:true}); }
  });
})();
