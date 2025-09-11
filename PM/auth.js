/* /auth.js — charge le SDK Auth0 avec multiples fallbacks + statut visuel */
(() => {
  const CFG = {
    domain: 'dev-zl3rulx7tauw5f4h.us.auth0.com',       // ex: dev-xxxxx.eu.auth0.com
    clientId: 'etdVdsWZQSoyQtrNdUKDRxytmXM4cZFL',
    redirectPath: '/adherents/',
    rolesClaim: 'https://pmarly/roles'
  };

  const SDK_URLS = [
    'https://cdn.auth0.com/js/auth0-spa-js/2.4/auth0-spa-js.production.js',
    'https://cdn.auth0.com/js/auth0-spa-js/2.1/auth0-spa-js.production.js',
    'https://cdn.jsdelivr.net/npm/@auth0/auth0-spa-js@2/dist/auth0-spa-js.production.js',
    'https://unpkg.com/@auth0/auth0-spa-js@2/dist/auth0-spa-js.production.js'
  ];

  let auth0Client = null;

  // ---------- UI helpers ----------
  function injectStyle() {
    if (document.getElementById('auth-cta-style')) return;
    const css = `
      #auth-cta{
        position:fixed; top:12px; right:12px; z-index:9999;
        display:inline-block; padding:.45rem .9rem; border-radius:999px; font-weight:700;
        border:1px solid rgba(255,255,255,.6); background:rgba(0,0,0,.35); color:#fff; text-decoration:none;
        backdrop-filter:blur(4px); box-shadow:0 2px 10px rgba(0,0,0,.25); cursor:pointer; transition:.18s;
      }
      #auth-cta[aria-disabled="true"]{ opacity:.6; cursor:not-allowed; }
      #auth-cta:hover{ background:rgba(0,0,0,.5); }
      #auth-status{
        position:fixed; top:54px; right:16px; z-index:9999;
        padding:.25rem .5rem; border-radius:6px; font-size:12px;
        background:rgba(0,0,0,.35); color:#fff; border:1px solid rgba(255,255,255,.4);
        backdrop-filter:blur(4px);
      }
    `;
    const s = document.createElement('style');
    s.id = 'auth-cta-style';
    s.textContent = css;
    document.head.appendChild(s);
  }

  function ensureCta() {
    let btn = document.getElementById('auth-cta');
    if (!btn) {
      btn = document.createElement('a');
      btn.id = 'auth-cta';
      btn.href = '#';
      btn.textContent = 'Connexion…';
      btn.setAttribute('aria-disabled', 'true');
      document.body.appendChild(btn);
    }
    return btn;
  }

  function setCta(label, { disabled = false, handler = null } = {}) {
    const btn = ensureCta();
    btn.textContent = label;
    btn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
    btn.onclick = null;
    if (!disabled && typeof handler === 'function') {
      btn.onclick = (e) => { e.preventDefault(); handler(); };
    }
  }

  function setStatus(text) {
    let el = document.getElementById('auth-status');
    if (!el) {
      el = document.createElement('div');
      el.id = 'auth-status';
      document.body.appendChild(el);
    }
    el.textContent = text;
  }

  // ---------- DOM utils ----------
  const show = (id, on = true) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hide', !on);
  };

  // ---------- Script loader with timeout ----------
  function loadScript(src, timeoutMs = 6000) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('timeout')), timeoutMs);
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => { clearTimeout(t); resolve(); };
      s.onerror = (e) => { clearTimeout(t); reject(e); };
      document.head.appendChild(s);
    });
  }

  async function loadAuth0Sdk() {
    if (typeof window.createAuth0Client === 'function') return true;

    // Alerte file://
    if (location.protocol === 'file:') {
      setStatus('file:// non supporté — lance un serveur (ex: Netlify dev)');
      return false;
    }

    for (const url of SDK_URLS) {
      try {
        setStatus('Chargement SDK…');
        await loadScript(url, 7000);
        if (typeof window.createAuth0Client === 'function') {
          setStatus('SDK OK');
          return true;
        }
      } catch (e) {
        console.warn('Échec SDK via', url, e);
      }
    }

    // Si on arrive ici : probablement CSP ou réseau
    // Indice CSP dans la console : "Refused to load the script ..."
    setStatus('SDK bloqué (CSP ? réseau ?)');
    setCta('Se connecter (indispo)', { disabled: true });
    return false;
  }

  // ---------- Rôles / rendu ----------
  function applyRoleVisibility(roles) {
    const hasAny = Array.isArray(roles) && roles.length > 0;
    show('guest', !hasAny);
    show('no-role', Array.isArray(roles) && roles.length === 0);
    show('app', hasAny);

    const rc = document.getElementById('role-cards');
    if (rc && hasAny) {
      const R = new Set(roles.map(r => String(r).trim()));
      rc.querySelectorAll('.card').forEach(card => {
        const need = (card.getAttribute('data-roles') || '')
          .split(',').map(s => s.trim()).filter(Boolean);
        const visible = need.length === 0 || need.some(r => R.has(r));
        card.style.display = visible ? '' : 'none';
      });
    }
    if (hasAny) {
      document.getElementById('fs-general')?.classList.remove('hide');
      document.getElementById('fs-roles')?.classList.remove('hide');
    }
  }

  async function renderUI() {
    const isAuth = await auth0Client.isAuthenticated();

    if (!isAuth) {
      setCta('Se connecter', {
        handler: async () => {
          await auth0Client.loginWithRedirect({
            authorizationParams: { redirect_uri: window.location.origin + CFG.redirectPath },
            appState: { targetUrl: CFG.redirectPath }
          });
        }
      });
      show('guest', true); show('no-role', false); show('app', false);
      return;
    }

    setCta('Se déconnecter', {
      handler: async () => {
        await auth0Client.logout({ logoutParams: { returnTo: window.location.origin } });
      }
    });

    const user = await auth0Client.getUser();
    const welcome = document.getElementById('welcome');
    if (welcome) welcome.textContent = `Bonjour ${user?.name || user?.email || 'adhérent'} !`;

    const roles = user?.[CFG.rolesClaim] || user?.roles || [];
    applyRoleVisibility(Array.isArray(roles) ? roles : []);
  }

  async function initAuth() {
    // 1) SDK
    const ok = await loadAuth0Sdk();
    if (!ok) return;

    // 2) Client
    auth0Client = await createAuth0Client({
      domain: CFG.domain,
      clientId: CFG.clientId,
      cacheLocation: 'localstorage',
      useRefreshTokens: true,
      authorizationParams: {
        redirect_uri: window.location.origin + CFG.redirectPath
      }
    });

    // 3) Callback
    const p = new URLSearchParams(location.search);
    if (p.has('code') && p.has('state')) {
      try {
        const { appState } = await auth0Client.handleRedirectCallback();
        history.replaceState({}, document.title, location.pathname);
        location.replace(appState?.targetUrl || CFG.redirectPath);
        return;
      } catch (e) {
        console.error('Callback Auth0', e);
        setStatus('Erreur callback');
      }
    }

    // 4) UI
    await renderUI();
  }

  document.addEventListener('DOMContentLoaded', async () => {
    injectStyle();
    ensureCta();
    setCta('Connexion…', { disabled: true });
    try {
      await initAuth();
    } catch (e) {
      console.error('Init Auth erreur', e);
      setStatus('Init erreur');
      setCta('Se connecter (indispo)', { disabled: true });
    }
  });
})();
