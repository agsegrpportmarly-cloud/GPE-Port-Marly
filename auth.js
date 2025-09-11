/* /auth.js — Intégration Auth0 simple, sans Netlify Functions/Edge */
(() => {
  const CFG = {
    domain: 'dev-zl3rulx7tauw5f4h.us.auth0.com',     // ex: dev-xxxxxx.eu.auth0.com
    clientId: 'etdVdsWZQSoyQtrNdUKDRxytmXM4cZFL',
    // Page de retour après login (ton espace adhérents)
    redirectPath: '/adherents/',
    // Claim custom où tu ranges les rôles (garde la même clé que d'habitude)
    rolesClaim: 'https://pmarly/roles'
  };

  let auth0Client;

  // ---- Helpers UI ----
  const $ = (sel) => document.querySelector(sel);
  const show = (id, on = true) => { const el = document.getElementById(id); if (el) el.classList.toggle('hide', !on); };

  function injectStyle() {
    if (document.getElementById('auth-cta-style')) return;
    const css = `
      #auth-cta{
        position:fixed; top:12px; right:12px; z-index:9999;
        display:inline-block; padding:.45rem .9rem; border-radius:999px; font-weight:700;
        border:1px solid rgba(255,255,255,.6); background:rgba(0,0,0,.35); color:#fff; text-decoration:none;
        backdrop-filter:blur(4px); box-shadow:0 2px 10px rgba(0,0,0,.25); cursor:pointer; transition:.18s;
      }
      #auth-cta:hover{ background:rgba(0,0,0,.5); }
    `;
    const style = document.createElement('style');
    style.id = 'auth-cta-style';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function ensureCta() {
    let btn = document.getElementById('auth-cta');
    if (!btn) {
      btn = document.createElement('a');
      btn.id = 'auth-cta';
      btn.href = '#';
      btn.textContent = 'Se connecter';
      document.body.appendChild(btn);
    }
    return btn;
  }

  // ---- Rendu des sections en fonction de l'état / des rôles ----
  function applyRoleVisibility(roles) {
    const hasAnyRole = (roles && roles.length > 0);
    show('guest', !hasAnyRole);        // si pas de rôle → on reste “visiteur”
    show('no-role', !!roles && roles.length === 0); // connecté mais aucun rôle
    show('app', hasAnyRole);           // connecté avec ≥1 rôle

    // Filtrer les cartes d'unités selon data-roles
    const roleSet = new Set((roles || []).map(r => String(r).trim()));
    document.querySelectorAll('#role-cards .card').forEach(card => {
      const needed = (card.getAttribute('data-roles') || '').split(',').map(s => s.trim()).filter(Boolean);
      const visible = needed.length === 0 || needed.some(r => roleSet.has(r));
      card.style.display = visible ? '' : 'none';
    });

    // Afficher les fieldsets si on a des rôles
    if (hasAnyRole) {
      document.getElementById('fs-general')?.classList.remove('hide');
      document.getElementById('fs-roles')?.classList.remove('hide');
    }
  }

  async function renderUI() {
    const btn = ensureCta();
    const isAuth = await auth0Client.isAuthenticated();

    if (!isAuth) {
      btn.textContent = 'Se connecter';
      btn.onclick = async (e) => {
        e.preventDefault();
        await auth0Client.loginWithRedirect({
          authorizationParams: {
            redirect_uri: window.location.origin + CFG.redirectPath
          },
          appState: { targetUrl: CFG.redirectPath }
        });
      };
      show('guest', true); show('no-role', false); show('app', false);
      return;
    }

    // Authentifié
    btn.textContent = 'Se déconnecter';
    btn.onclick = async (e) => {
      e.preventDefault();
      await auth0Client.logout({
        logoutParams: { returnTo: window.location.origin }
      });
    };

    const user = await auth0Client.getUser();
    console.log('Auth0 user →', user);
    const welcome = document.getElementById('welcome');
    if (welcome) welcome.textContent = `Bonjour ${user?.name || user?.email || 'adhérent'} !`;

    // Rôles depuis le claim custom
    const roles =
      user?.[CFG.rolesClaim] ||
      user?.[CFG.rolesClaim + '/'] || // au cas où la clé ait un slash final
      user?.roles || [];

    applyRoleVisibility(Array.isArray(roles) ? roles : []);
  }

  async function init() {
    if (typeof createAuth0Client !== 'function') {
      console.error('Auth0 SDK non chargé (createAuth0Client undefined)');
      return;
    }

    auth0Client = await createAuth0Client({
      domain: CFG.domain,
      clientId: CFG.clientId,
      cacheLocation: 'localstorage',
      useRefreshTokens: true,
      authorizationParams: {
        redirect_uri: window.location.origin + CFG.redirectPath
      }
    });

    // Gestion du callback Auth0 (?code=&state=)
    const params = new URLSearchParams(window.location.search);
    if (params.has('code') && params.has('state')) {
      try {
        const { appState } = await auth0Client.handleRedirectCallback();
        // Nettoyer l’URL puis rediriger
        window.history.replaceState({}, document.title, window.location.pathname);
        window.location.replace(appState?.targetUrl || CFG.redirectPath);
        return;
      } catch (err) {
        console.error('Erreur callback Auth0:', err);
      }
    }

    injectStyle();
    await renderUI();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
