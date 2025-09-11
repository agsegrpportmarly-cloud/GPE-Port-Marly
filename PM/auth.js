/* /auth.js — version robuste : charge le SDK elle-même + bouton garanti */
(() => {
  const CFG = {
    domain: 'YOUR_AUTH0_DOMAIN',          // ex: dev-xxxxx.eu.auth0.com
    clientId: 'YOUR_AUTH0_CLIENT_ID',
    redirectPath: '/adherents/',          // page de retour après login
    rolesClaim: 'https://pmarly/roles'    // claim custom des rôles
  };

  let auth0Client = null;

  // ---------- Utils DOM ----------
  const $ = (sel) => document.querySelector(sel);
  const show = (id, on = true) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('hide', !on);
  };
  const on = (el, ev, fn) => el && el.addEventListener(ev, fn);

  // ---------- Bouton & style : toujours injectés ----------
  function injectStyle() {
    if (document.getElementById('auth-cta-style')) return;
    const style = document.createElement('style');
    style.id = 'auth-cta-style';
    style.textContent = `
      #auth-cta{
        position:fixed; top:12px; right:12px; z-index:9999;
        display:inline-block; padding:.45rem .9rem; border-radius:999px; font-weight:700;
        border:1px solid rgba(255,255,255,.6); background:rgba(0,0,0,.35); color:#fff; text-decoration:none;
        backdrop-filter:blur(4px); box-shadow:0 2px 10px rgba(0,0,0,.25); cursor:pointer; transition:.18s;
      }
      #auth-cta[aria-disabled="true"]{ opacity:.6; cursor:not-allowed; }
      #auth-cta:hover{ background:rgba(0,0,0,.5); }
    `;
    document.head.appendChild(style);
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

  // ---------- Charge le SDK Auth0 (primaire + fallback) ----------
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  async function loadAuth0Sdk() {
    if (typeof window.createAuth0Client === 'function') return;
    try {
      await loadScript('https://cdn.auth0.com/js/auth0-spa-js/2.4/auth0-spa-js.production.js');
    } catch {
      // Fallback CDN
      await loadScript('https://cdn.jsdelivr.net/npm/@auth0/auth0-spa-js@2.4.3/dist/auth0-spa-js.production.js');
    }
  }

  // ---------- Rendu selon état / rôles ----------
  function applyRoleVisibility(roles) {
    const hasAnyRole = Array.isArray(roles) && roles.length > 0;

    // Sections facultatives : on ne plante pas si absentes
    show('guest', !hasAnyRole);
    show('no-role', Array.isArray(roles) && roles.length === 0);
    show('app', hasAnyRole);

    // Filtrer les cartes d'unités
    const container = document.getElementById('role-cards');
    if (container && hasAnyRole) {
      const roleSet = new Set(roles.map(r => String(r).trim()));
      container.querySelectorAll('.card').forEach(card => {
        const needed = (card.getAttribute('data-roles') || '')
          .split(',').map(s => s.trim()).filter(Boolean);
        const visible = needed.length === 0 || needed.some(r => roleSet.has(r));
        card.style.display = visible ? '' : 'none';
      });
    }

    // Afficher les fieldsets si on a des rôles
    if (hasAnyRole) {
      document.getElementById('fs-general')?.classList.remove('hide');
      document.getElementById('fs-roles')?.classList.remove('hide');
    }
  }

  async function renderUI() {
    const isAuth = await auth0Client.isAuthenticated();

    if (!isAuth) {
      setCta('Se connecter', {
        disabled: false,
        handler: async () => {
          await auth0Client.loginWithRedirect({
            authorizationParams: {
              redirect_uri: window.location.origin + CFG.redirectPath
            },
            appState: { targetUrl: CFG.redirectPath }
          });
        }
      });
      // Visiteur par défaut
      show('guest', true); show('no-role', false); show('app', false);
      return;
    }

    // Authentifié
    setCta('Se déconnecter', {
      disabled: false,
      handler: async () => {
        await auth0Client.logout({
          logoutParams: { returnTo: window.location.origin }
        });
      }
    });

    const user = await auth0Client.getUser();
    const welcome = document.getElementById('welcome');
    if (welcome) welcome.textContent = `Bonjour ${user?.name || user?.email || 'adhérent'} !`;

    const roles =
      user?.[CFG.rolesClaim] ||
      user?.roles ||
      [];

    applyRoleVisibility(Array.isArray(roles) ? roles : []);
  }

  async function initAuth() {
    // 1) Charger le SDK si besoin
    await loadAuth0Sdk();
    if (typeof window.createAuth0Client !== 'function') {
      console.error('Auth0 SDK non chargé');
      setCta('Se connecter (indispo)', { disabled: true });
      return;
    }

    // 2) Créer le client
    auth0Client = await createAuth0Client({
      domain: CFG.domain,
      clientId: CFG.clientId,
      cacheLocation: 'localstorage',
      useRefreshTokens: true,
      authorizationParams: {
        redirect_uri: window.location.origin + CFG.redirectPath
      }
    });

    // 3) Gérer le callback ?code=&state= si présent
    const params = new URLSearchParams(window.location.search);
    if (params.has('code') && params.has('state')) {
      try {
        const { appState } = await auth0Client.handleRedirectCallback();
        // Nettoyer l’URL puis rediriger vers la cible
        window.history.replaceState({}, document.title, window.location.pathname);
        window.location.replace(appState?.targetUrl || CFG.redirectPath);
        return; // on laisse la page de destination refaire son init
      } catch (err) {
        console.error('Erreur callback Auth0:', err);
      }
    }

    // 4) Rendu
    await renderUI();
  }

  // ---------- Boot ----------
  document.addEventListener('DOMContentLoaded', async () => {
    injectStyle();
    ensureCta();                 // bouton visible dès le départ
    setCta('Connexion…', { disabled: true }); // bloqué le temps de l’init
    try {
      await initAuth();
    } catch (e) {
      console.error('Init Auth – erreur:', e);
      setCta('Se connecter (indispo)', { disabled: true });
    }
  });
})();
