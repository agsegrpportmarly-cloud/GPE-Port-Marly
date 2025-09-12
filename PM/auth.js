/* /PM/auth.js — exécution unique + SDK déjà chargé par la page */
(() => {
  if (window.__PM_AUTH_BOOTSTRAPPED__) return;
  window.__PM_AUTH_BOOTSTRAPPED__ = true;

  const CFG = {
    domain: 'YOUR_AUTH0_DOMAIN',   // ex: dev-xxxxx.eu.auth0.com
    clientId: 'YOUR_AUTH0_CLIENT_ID',
    rolesClaim: 'https://pmarly/roles'
  };

  // Base path auto (ex: '/PM/')
  const thisScript = document.currentScript || [...document.scripts].find(s => (s.src||'').includes('/auth.js'));
  const baseUrl = thisScript ? new URL(thisScript.src, window.location.href) : new URL(window.location.href);
  const BASE_PATH = baseUrl.pathname.replace(/[^/]+$/, '');
  const ABS = (p) => BASE_PATH + String(p).replace(/^\//,'');
  const REDIRECT_PATH = ABS('adherents/');

  let auth0Client = null;

  function ensureBtn(){
    let b = document.getElementById('auth-cta');
    if (!b) {
      b = document.createElement('a');
      b.id = 'auth-cta';
      b.href = '#';
      b.textContent = 'Connexion…';
      b.setAttribute('aria-disabled','true');
      document.body.appendChild(b);
    }
    return b;
  }
  function setBtn(label, {disabled=false, onClick=null}={}){
    const b = ensureBtn();
    b.textContent = label;
    b.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    b.onclick = null;
    if (!disabled && onClick) b.onclick = (e)=>{ e.preventDefault(); onClick(); };
  }
  function status(t){
    let el = document.getElementById('auth-status');
    if (!el) { el = document.createElement('div'); el.id='auth-status'; document.body.appendChild(el); }
    el.textContent = t;
  }
  const show = (id,on=true)=>{ const el=document.getElementById(id); if(el) el.classList.toggle('hide',!on); };

  async function render(){
    const isAuth = await auth0Client.isAuthenticated();

    if (!isAuth) {
      setBtn('Se connecter', { onClick: async ()=>{
        await auth0Client.loginWithRedirect({
          authorizationParams:{ redirect_uri: window.location.origin + REDIRECT_PATH },
          appState:{ targetUrl: REDIRECT_PATH }
        });
      }});
      show('guest', true); show('no-role', false); show('app', false);
      return;
    }

    setBtn('Se déconnecter', { onClick: async ()=>{
      await auth0Client.logout({ logoutParams:{ returnTo: window.location.origin } });
    }});

    const user = await auth0Client.getUser();
    const w = document.getElementById('welcome');
    if (w) w.textContent = `Bonjour ${user?.name || user?.email || 'adhérent'} !`;

    const roles = user?.[CFG.rolesClaim] || user?.roles || [];
    const any = Array.isArray(roles) && roles.length > 0;
    show('guest', !any);
    show('no-role', Array.isArray(roles) && roles.length === 0);
    show('app', any);
    if (any) {
      document.getElementById('fs-general')?.classList.remove('hide');
      document.getElementById('fs-roles')?.classList.remove('hide');
      const rc = document.getElementById('role-cards');
      if (rc) {
        const set = new Set(roles.map(r=>String(r).trim()));
        rc.querySelectorAll('.card').forEach(card=>{
          const need=(card.getAttribute('data-roles')||'').split(',').map(s=>s.trim()).filter(Boolean);
          card.style.display = need.length===0 || need.some(r=>set.has(r)) ? '' : 'none';
        });
      }
    }
  }

  async function init(){
    if (typeof window.createAuth0Client !== 'function') {
      setBtn('Se connecter (indispo)', { disabled:true });
      status('SDK non chargé (vérifie le <script src="./vendor/auth0-spa-js.production.js">)');
      return;
    }

    auth0Client = await createAuth0Client({
      domain: CFG.domain,
      clientId: CFG.clientId,
      cacheLocation: 'localstorage',
      useRefreshTokens: true,
      authorizationParams: {
        redirect_uri: window.location.origin + REDIRECT_PATH
      }
    });

    const p = new URLSearchParams(location.search);
    if (p.has('code') && p.has('state')) {
      try {
        const { appState } = await auth0Client.handleRedirectCallback();
        history.replaceState({}, document.title, location.pathname);
        location.replace(appState?.targetUrl || REDIRECT_PATH);
        return;
      } catch {
        status('Erreur callback');
      }
    }

    status('SDK OK');
    await render();
  }

  document.addEventListener('DOMContentLoaded', async ()=>{
    ensureBtn();
    setBtn('Connexion…', { disabled:true });
    try { await init(); }
    catch { status('Init erreur'); setBtn('Se connecter (indispo)', { disabled:true }); }
  });
})();
