/* /PM/auth.js — auto-prefix (PM ou racine), self-host du SDK, bouton garanti */
(() => {
  const CFG = {
    domain: 'dev-zl3rulx7tauw5f4h.us.auth0.com',       // ex: dev-xxxxx.eu.auth0.com
    clientId: 'etdVdsWZQSoyQtrNdUKDRxytmXM4cZFL',
    rolesClaim: 'https://pmarly/roles'
  };

  // ===== Base path auto (ex: '/PM/' si le site est publié depuis ce dossier) =====
  const thisScript = document.currentScript || [...document.scripts].find(s => (s.src||'').includes('/auth.js'));
  const baseUrl = thisScript ? new URL(thisScript.src) : new URL(window.location.href);
  const BASE_PATH = baseUrl.pathname.replace(/[^/]+$/, '');         // ex: '/PM/'
  const ABS = (p) => BASE_PATH + String(p).replace(/^\//,'');       // '/PM/' + 'adherents/' => '/PM/adherents/'

  const REDIRECT_PATH = ABS('adherents/');                          // ex: '/PM/adherents/'

  let auth0Client = null;

  // ---------- UI (bouton + statut) ----------
  function injectCss(){ if(document.getElementById('auth-cta-style')) return;
    const s=document.createElement('style'); s.id='auth-cta-style'; s.textContent=`
      #auth-cta{position:fixed;top:12px;right:12px;z-index:9999;display:inline-block;padding:.45rem .9rem;border-radius:999px;font-weight:700;border:1px solid rgba(255,255,255,.6);background:rgba(0,0,0,.35);color:#fff;text-decoration:none;backdrop-filter:blur(4px);box-shadow:0 2px 10px rgba(0,0,0,.25);cursor:pointer;transition:.18s}
      #auth-cta[aria-disabled="true"]{opacity:.6;cursor:not-allowed}
      #auth-cta:hover{background:rgba(0,0,0,.5)}
      #auth-status{position:fixed;top:54px;right:16px;z-index:9999;padding:.25rem .5rem;border-radius:6px;font-size:12px;background:rgba(0,0,0,.35);color:#fff;border:1px solid rgba(255,255,255,.4);backdrop-filter:blur(4px)}
    `; document.head.appendChild(s); }
  function ensureBtn(){ let b=document.getElementById('auth-cta');
    if(!b){ b=document.createElement('a'); b.id='auth-cta'; b.href='#'; b.textContent='Connexion…'; b.setAttribute('aria-disabled','true'); document.body.appendChild(b); }
    return b; }
  function setBtn(label,{disabled=false,onClick=null}={}){ const b=ensureBtn(); b.textContent=label; b.setAttribute('aria-disabled',disabled?'true':'false'); b.onclick=null; if(!disabled && onClick){ b.onclick=(e)=>{e.preventDefault(); onClick();}; } }
  function status(t){ let el=document.getElementById('auth-status'); if(!el){ el=document.createElement('div'); el.id='auth-status'; document.body.appendChild(el); } el.textContent=t; }
  const show=(id,on=true)=>{ const el=document.getElementById(id); if(el) el.classList.toggle('hide',!on); };

  // ---------- SDK local depuis le même dossier que auth.js (ex: /PM/vendor/...) ----------
  function vendorCandidates(){
    const out = new Set();
    // Chemin basé sur auth.js
    out.add(new URL('vendor/auth0-spa-js.production.js', baseUrl).href);   // /PM/vendor/...
    // Relatif à la page (en secours)
    out.add(new URL('../vendor/auth0-spa-js.production.js', window.location.href).href);
    // Absolus possibles selon publish dir
    out.add(window.location.origin + '/vendor/auth0-spa-js.production.js');
    out.add(window.location.origin + '/PM/vendor/auth0-spa-js.production.js');
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
      }catch(_){}
    }
    status('SDK introuvable (chemin local)'); setBtn('Se connecter (indispo)', {disabled:true}); return false;
  }

  // ---------- Rôles / affichage ----------
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
          authorizationParams:{ redirect_uri: window.location.origin + REDIRECT_PATH },
          appState:{ targetUrl: REDIRECT_PATH }
        });
      }});
      show('guest',true); show('no-role',false); show('app',false);
      return;
    }
