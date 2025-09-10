// tout en haut de auth.js
let auth0Client = null;
let AUTH_READY = false;

async function waitForAuth0Sdk(maxTries = 40, delayMs = 100) {
  for (let i = 0; i < maxTries; i++) {
    if (typeof createAuth0Client === "function") return true;
    await new Promise(r => setTimeout(r, delayMs));
  }
  return false;
}

// ... tes constantes (AUTH0_DOMAIN, etc.) et le reste ...
// --- Loader Auth0 (charge le SDK si absent) ---
const AUTH0_SDK_URL_PRIMARY  = "https://cdn.auth0.com/js/auth0-spa-js/2.1/auth0-spa-js.production.js";
const AUTH0_SDK_URL_FALLBACK = "https://cdn.jsdelivr.net/npm/@auth0/auth0-spa-js@2.1.4/dist/auth0-spa-js.production.js";

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.defer = true;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function ensureAuth0Sdk() {
  if (typeof createAuth0Client === "function") return true;
  try {
    await loadScript(AUTH0_SDK_URL_PRIMARY);
  } catch {
    // essaie un CDN alternatif
    await loadScript(AUTH0_SDK_URL_FALLBACK);
  }
  return typeof createAuth0Client === "function";
}
async function initAuth() {
  const ok = await ensureAuth0Sdk();
  if (!ok) {
    console.error("Auth0 SDK non chargé après tentative (CDN bloqué ?)");
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
  // ... le reste inchangé
}

  window.auth0Client = auth0Client;
  AUTH_READY = true;

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

// démarre après DOM prêt (pas de await top-level)
window.addEventListener("DOMContentLoaded", () => {
  initAuth().catch(console.error);
});


function bindUi() {
  // Bouton "Demander l'accès" (section no-role)
  const req = document.getElementById("btn-request-access");
  if (req) {
    req.onclick = async (e) => {
      e.preventDefault();
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
    };
  }
}

// --- Flux Auth ---
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
  AUTH_READY = true;

  // Gérer le callback (code/state) après retour Auth0
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

async function render() {
  const isAuthenticated = await auth0Client.isAuthenticated();

  // Met à jour le bouton flottant en haut à droite
  setAuthCta(isAuthenticated);

  const guest   = document.getElementById("guest");
  const app     = document.getElementById("app");
  const noRole  = document.getElementById("no-role");
  const fsGen   = document.getElementById("fs-general");
  const fsRoles = document.getElementById("fs-roles");
  const welcome = document.getElementById("welcome");

  if (!isAuthenticated) {
    guest?.classList.remove("hide");
    app?.classList.add("hide");
    noRole?.classList.add("hide");
    fsGen?.classList.add("hide");
    fsRoles?.classList.add("hide");
    return;
  }

  // Connecté
  guest?.classList.add("hide");
  app?.classList.remove("hide");

  const user = await auth0Client.getUser();
  if (welcome) welcome.textContent = `Bonjour ${user?.name || user?.email || "Adhérent"}`;

  // Récup roles depuis l'ID token
  const claims = await auth0Client.getIdTokenClaims();
  const roles = (claims?.[ROLES_CLAIM] || []).map(r => String(r).toLowerCase());
  const hasAnyRole = roles.length > 0;

  if (hasAnyRole) {
    fsGen?.classList.remove("hide");
    fsRoles?.classList.remove("hide");
    noRole?.classList.add("hide");
    filterRoleCards(roles);
  } else {
    fsGen?.classList.add("hide");
    fsRoles?.classList.add("hide");
    noRole?.classList.remove("hide");
  }
}

function filterRoleCards(userRoles) {
  const userSet = new Set(userRoles.map(r => r.trim().toLowerCase()));
  document.querySelectorAll('#role-cards .card').forEach(card => {
    const need = (card.getAttribute('data-roles') || "")
      .split(",")
      .map(r => r.trim().toLowerCase())
      .filter(Boolean);
    // visible si au moins un rôle requis est présent
    const visible = need.length === 0 || need.some(n => userSet.has(n));
    card.style.display = visible ? "" : "none";
  });
}

async function login() {
  await auth0Client.loginWithRedirect({
    authorizationParams: { redirect_uri: window.location.origin + "/adherents/" }
  });
}

async function logout() {
  await auth0Client.logout({
    logoutParams: { returnTo: window.location.origin + "/" }
  });
}

// Lance l'init APRES chargement du DOM (pas de top-level await)
window.addEventListener("DOMContentLoaded", () => {
  initAuth().catch(console.error);
});
