// ====== CONFIG ======
const API_BASE = window.APP_CONFIG.API_BASE;
const K_TOKEN = 'dt_token';
const K_USER  = 'dt_user';

// ====== HELPERS ======
const $  = (s, r=document) => r.querySelector(s);
const $$ = (s, r=document) => [...r.querySelectorAll(s)];

function setMsg(text, type=''){
  const el = $('#authMsg');
  if (!el) return;
  el.textContent = text || '';
  el.className = 'auth-msg' + (type ? ` ${type}` : '');
}

function saveSession({ token, user }){
  if (token) localStorage.setItem(K_TOKEN, token);
  if (user)  localStorage.setItem(K_USER, JSON.stringify(user));
  renderLoggedState();
}

function clearSession(){
  localStorage.removeItem(K_TOKEN);
  localStorage.removeItem(K_USER);
  renderLoggedState();
}

const getToken = () => localStorage.getItem(K_TOKEN);
const getUser  = () => {
  const r = localStorage.getItem(K_USER);
  return r ? JSON.parse(r) : null;
};

// ====== JWT EXP CHECK ======
function parseJwt(token){
  try{
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g,'+').replace(/_/g,'/');
    const jsonPayload = decodeURIComponent(
      atob(base64).split('').map(c => '%' + ('00'+c.charCodeAt(0).toString(16)).slice(-2)).join('')
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

function isTokenExpired(token){
  const p = parseJwt(token);
  if (!p?.exp) return true; // sin exp => inválido para nosotros
  const now = Math.floor(Date.now()/1000);
  return p.exp <= now;
}

function ensureValidSession(){
  const token = getToken();
  if (!token) return true;
  if (isTokenExpired(token)) {
    clearSession();
    return false;
  }
  return true;
}

// ====== API ======
async function apiFetchPublic(path, {method='GET', body, headers={}, auth=false} = {}) {
  const opts = { method, headers: { ...headers } };

  // Body
  if (body && !(body instanceof FormData)) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  } else if (body instanceof FormData) {
    opts.body = body;
  }

  // Auth guard (token vencido)
  if (auth) {
    if (!ensureValidSession()) {
      return { ok:false, status:401, data:{ error:'Sesión expirada' } };
    }
    const t = getToken();
    if (t) opts.headers['Authorization'] = `Bearer ${t}`;
  }

  // DEBUG opcional
  // console.log('[apiFetchPublic] →', method, path);

  const res = await fetch(`${API_BASE}${path}`, opts);

  const ct = res.headers.get('content-type') || '';
  let data = null;

  if (ct.includes('application/json')) {
    try { data = await res.json(); } catch {}
  } else {
    try { data = await res.text(); } catch {}
  }

  // Si el backend dice 401, cerramos sesión visualmente
  if (res.status === 401) {
    clearSession();

    // Si está en Perfil y no autorizado, mandalo al inicio (opcional)
    if (location.pathname.toLowerCase().includes('perfil')) {
      try { location.replace('../HTML/index.html'); } catch {}
    }
  }

  if (!res.ok) {
    // console.error('[apiFetchPublic] ←', res.status, data);
  }

  return { ok: res.ok, status: res.status, data };
}

// ====== MODAL UI ======
const authModal = $('#authModal');
const btnUser   = $('#btnUser');
const btnClose  = $('#authClose');
const tabsRow   = $('.auth-tabs');

function openModal(tab='login'){
  switchTab(tab);
  authModal?.classList.add('active');
  authModal?.setAttribute('aria-hidden','false');
  setMsg('');
}

function closeModal(){
  authModal?.classList.remove('active');
  authModal?.setAttribute('aria-hidden','true');
}

btnUser?.addEventListener('click', () => openModal(getUser() ? 'logged' : 'login'));
btnClose?.addEventListener('click', closeModal);

authModal?.addEventListener('click', (e)=>{
  if (e.target === authModal || e.target.classList.contains('auth-backdrop')) closeModal();
});

document.addEventListener('keydown', (e)=>{
  if (e.key === 'Escape') closeModal();
});

// Tabs
const tabButtons = $$('.auth-tab');

function switchTab(tab){
  tabButtons.forEach(b => b.classList.toggle('active', b.dataset.tab === tab));

  const loginPanel    = $('[data-tab-content="login"]');
  const registerPanel = $('[data-tab-content="register"]');
  const loggedPanel   = $('#loggedPanel');

  if (loginPanel)    loginPanel.classList.toggle('hidden', tab !== 'login');
  if (registerPanel) registerPanel.classList.toggle('hidden', tab !== 'register');

  if (loggedPanel) {
    if (tab === 'logged') {
      loginPanel?.classList.add('hidden');
      registerPanel?.classList.add('hidden');
      loggedPanel.classList.remove('hidden');
      tabsRow?.classList.add('hidden');
    } else {
      loggedPanel.classList.add('hidden');
      tabsRow?.classList.remove('hidden');
    }
  }
}

tabButtons.forEach(b => b.addEventListener('click', ()=> switchTab(b.dataset.tab)));

$$('[data-switch]').forEach(a => a.addEventListener('click',(e)=>{
  e.preventDefault();
  switchTab(a.dataset.switch);
  setMsg('');
}));

// ====== UI LOGGED STATE ======
function getInitial(u){
  const name = (u?.nombre || '').trim();
  if (name) return name[0].toUpperCase();
  const correo = (u?.correo || '').trim();
  return correo ? correo[0].toUpperCase() : 'U';
}

function isAdmin(u){
  // ajusta según tus IDs: 2 = Admin (como venías usando)
  return Number(u?.id_rol_usuario) === 2;
}

function renderLoggedState(){
  const u = getUser();

  const helloName  = $('#helloName');
  const helloEmail = $('#helloEmail');
  const avatar     = $('#avatarCircle');
  const badge      = $('#userBadge');
  const adminCard  = $('#adminCard');

  if (helloName)  helloName.textContent  = u?.nombre || u?.correo || 'usuario';
  if (helloEmail) helloEmail.textContent = u?.correo || '';
  if (avatar)     avatar.textContent     = getInitial(u);

  if (badge) badge.hidden = !u;
  if (adminCard) adminCard.classList.toggle('hidden', !isAdmin(u));
}

// ====== SUBMITS ======
$('#loginForm')?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  setMsg('Ingresando...');

  const fd = new FormData(e.currentTarget);
  const body = { correo: fd.get('correo'), contrasena: fd.get('contrasena') };

  const { ok, status, data } = await apiFetchPublic('/api/auth/login', { method:'POST', body });

  if (ok) {
    saveSession({ token: data?.token, user: data?.user });
    setMsg('¡Bienvenido!', 'ok');
    switchTab('logged');
  } else if (status === 401) {
    setMsg('Credenciales inválidas.', 'error');
  } else {
    setMsg('Error al iniciar sesión.', 'error');
  }
});

$('#registerForm')?.addEventListener('submit', async (e)=>{
  e.preventDefault();
  setMsg('Creando cuenta...');

  const fd = new FormData(e.currentTarget);
  const body = {
    correo: fd.get('correo'),
    contrasena: fd.get('contrasena'),
    nombre: fd.get('nombre') || undefined,
    primer_apellido: fd.get('primer_apellido') || undefined,
    segundo_apellido: fd.get('segundo_apellido') || undefined,
    negocio: fd.get('negocio') || undefined,
  };

  const { ok, status } = await apiFetchPublic('/api/auth/register', { method:'POST', body });

  if (ok) {
    setMsg('Cuenta creada. Inicia sesión para continuar.', 'ok');
    switchTab('login');
  } else if (status === 409) {
    setMsg('Ese correo ya está registrado.', 'error');
  } else {
    setMsg('No se pudo crear la cuenta.', 'error');
  }
});

// ====== LOGOUT CONFIRM ======
const logoutConfirm = $('#logoutConfirm');

$('#btnLogout')?.addEventListener('click', (e)=>{
  e.preventDefault();
  logoutConfirm?.classList.remove('hidden');
});

$('#confirmLogout')?.addEventListener('click', ()=>{
  clearSession();
  setMsg('Sesión cerrada.', 'ok');
  switchTab('login');
  logoutConfirm?.classList.add('hidden');
});

$('#cancelLogout')?.addEventListener('click', ()=>{
  logoutConfirm?.classList.add('hidden');
});

// ====== UPDATE USER HELPER ======
function updateUser(patch){
  const cur = getUser() || {};
  const merged = { ...cur, ...patch };
  localStorage.setItem(K_USER, JSON.stringify(merged));
  renderLoggedState();
}
window.updateUser = updateUser;

// ====== EXPORTS GLOBALS ======
window.DT_API_BASE = API_BASE;
window.apiFetch = apiFetchPublic;
window.apiFetchPublic = apiFetchPublic;

// ====== INIT ======
// Si el token ya venía vencido al abrir la app, cerrar sesión visualmente
ensureValidSession();
renderLoggedState();

// Opcional: auto-logout cuando expira sin recargar
setInterval(() => {
  const token = getToken();
  if (token && isTokenExpired(token)) clearSession();
}, 30000);
