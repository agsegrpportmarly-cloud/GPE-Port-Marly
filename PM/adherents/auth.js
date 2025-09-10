let auth0Client = null;
let AUTH_READY = false; // ← on saura quand Auth0 est prêt



// === Paramètres à ADAPTER à ton tenant Auth0 ===
const AUTH0_DOMAIN    = "<ton-domaine>.eu.auth0.com";
const AUTH0_CLIENT_ID = "<ton-client-id>";
const AUTH0_AUDIENCE  = undefined; // si pas d'API
const ROLES_CLAIM     = "https://pmarly/roles"; // ex: ["chef","tresorier","admin"]

document.addEventListener("DOMContentLoaded", initAuth);

async function initAuth() {
  if (typeof createAuth0Client === "undefined") {
    console.error("Auth0 SDK non chargé (createAuth0Client undefined)");
    return;
  }

  auth0Client = await createAuth0Client({
    domain: AUTH0_DOMAIN,
    clientId: AUTH0_CLIENT_ID,
    authorizationParams: {
      redirect_uri: window.location.origin + "/adherents/",
      audience: AUTH0_AUDIENCE
    },
    cacheLocation: "localstorage"
  });
  window.auth0Client = auth0Client; // debug console
  AUTH_READY = true;                // ← prêt

  if (window.location.search.includes("code=") && window.location.search.includes("state=")) {
    try {
      await auth0Client.handleRedirectCallback();
      window.history.replaceState({}, document.title, "/adherents/");
    } catch (e) {
      console.error("Callback error:", e);
    }
  }

  bindUi();
  await render();
}


  bindUi();
  await render();
}

function bindUi() {
  // Bouton “Demander l’accès”
  document.getElementById("btn-request-access")?.addEventListener("click", requestAccess);

  // Liens du header
  document.getElementById("link-login")?.addEventListener("click", (e)=>{ e.preventDefault(); login(); });
  document.getElementById("link-logout")?.addEventListener("click", (e)=>{ e.preventDefault(); logout(); });
}
function setAuthCta(isAuthenticated) {
  const cta = document.getElementById("auth-cta");
  if (!cta) return;
  // reset
  cta.classList.remove("logout");
  cta.replaceWith(cta.cloneNode(true)); // enlève anciens listeners
  const fresh = document.getElementById("auth-cta");

  if (isAuthenticated) {
    fresh.textContent = "Se déconnecter";
    fresh.classList.add("logout");
    fresh.addEventListener("click", (e) => { e.preventDefault(); logout(); });
  } else {
    fresh.textContent = "Se connecter";
    fresh.addEventListener("click", (e) => { e.preventDefault(); login(); });
  }
}
function setAuthCta(isAuthenticated) {
  const el = document.getElementById("auth-cta");
  if (!el) return;

  // Reset propre des listeners
  const clone = el.cloneNode(true);
  el.replaceWith(clone);
  const btn = document.getElementById("auth-cta");

  // Libellé + style
  btn.textContent = isAuthenticated ? "Se déconnecter" : "Se connecter";
  btn.classList.toggle("logout", !!isAuthenticated);

  // Clic
  btn.addEventListener("click", async (e) => {
    e.preventDefault();
    // Si l'init n'est pas finie, on attend puis on relance l’action
    if (!AUTH_READY) {
      try { await initAuth(); } catch {}
    }
    if (!auth0Client) {
      console.error("Auth0 non initialisé");
      return;
    }
    if (isAuthenticated) {
      await logout();
    } else {
      await login();
    }
  });
}

async function render() {
  const isAuthenticated = await auth0Client.isAuthenticated();

  // ⬇️ IMPORTANT : met à jour le bouton flottant à chaque render
  setAuthCta(isAuthenticated);

  const guest   = document.getElementById("guest");
  const app     = document.getElementById("app");
  const noRole  = document.getElementById("no-role");
  const fsGen   = document.getElementById("fs-general");
  const fsRoles = document.getElementById("fs-roles");
  const welcome = document.getElementById("welcome");

  if (!isAuthenticated) {
    guest.classList.remove("hide");
    app.classList.add("hide");
    noRole.classList.add("hide");
    fsGen.classList.add("hide");
    fsRoles.classList.add("hide");
    return;
  }

  // Connecté
  guest.classList.add("hide");
  app.classList.remove("hide");

  linkLogin?.classList.add("hide");
  linkLogout?.classList.remove("hide");

  const user = await auth0Client.getUser();
  welcome.textContent = `Bonjour ${user?.name || user?.email || "Adhérent"}`;

  const idTokenClaims = await auth0Client.getIdTokenClaims();
  const roles = (idTokenClaims?.[ROLES_CLAIM] || []).map(r => String(r).toLowerCase());
  const hasAnyRole = roles.length > 0;

  if (hasAnyRole) {
    fsGen.classList.remove("hide");
    fsRoles.classList.remove("hide");
    noRole.classList.add("hide");
    filterRoleCards(roles);
  } else {
    fsGen.classList.add("hide");
    fsRoles.classList.add("hide");
    noRole.classList.remove("hide");
  }
}


function filterRoleCards(userRoles) {
  const userSet = new Set(userRoles.map(r => r.trim().toLowerCase()));
  document.querySelectorAll('#role-cards .card').forEach(card => {
    const need = (card.getAttribute('data-roles') || "")
      .split(",")
      .map(r => r.trim().toLowerCase())
      .filter(Boolean);
    const visible = need.length === 0 || need.some(n => userSet.has(n));
    card.style.display = visible ? "" : "none";
  });
}

async function login() {
  if (!auth0Client) await initAuth();
  await auth0Client.loginWithRedirect({
    authorizationParams: { redirect_uri: window.location.origin + "/adherents/" }
  });
}

async function logout() {
  if (!auth0Client) await initAuth();
  await auth0Client.logout({ logoutParams: { returnTo: window.location.origin + "/" } });
}

async function requestAccess() {
  try {
    const user = await auth0Client.getUser();
    const email = user?.email || "";
    const name  = user?.name || "";
    const subject = `Demande d'accès – ${name || email}`;
    const body =
`Bonjour,

Je souhaite obtenir un rôle d’accès à l’espace adhérents.
Nom: ${name}
Email: ${email}

Rôle(s) demandé(s): (préciser)

Merci !`;
    const mailto = `mailto:agse.grp.portmarly@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
  } catch {
    window.location.href = "mailto:agse.grp.portmarly@gmail.com?subject=Demande%20d%27accès%20Espace%20adhérents";
  }
}
(function(){
  const qs = new URLSearchParams(location.search);
  if (qs.get('debug') !== '1') return;
  const box = document.createElement('div');
  box.style.cssText='position:fixed;top:8px;right:8px;background:#111;color:#0f0;padding:8px 10px;border-radius:8px;font:12px/1.2 monospace;z-index:99999';
  box.textContent='auth…';
  document.body.appendChild(box);
  (async()=>{
    try{
      const ok = await auth0Client.isAuthenticated();
      const c  = ok ? await auth0Client.getIdTokenClaims() : null;
      const r  = c ? (c["https://pmarly/roles"]||[]) : [];
      box.textContent = `auth=${ok} roles=${JSON.stringify(r)}`;
    }catch(e){ box.textContent='debug err'; }
  })();
})();

