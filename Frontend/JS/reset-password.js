// Ajustá esto a tu backend
const API_BASE = window.APP_CONFIG.API_BASE;

const params = new URLSearchParams(location.search);
const token = params.get("token");

const form = document.getElementById("formReset");
const pass1 = document.getElementById("pass1");
const pass2 = document.getElementById("pass2");
const toggle1 = document.getElementById("toggle1");
const toggle2 = document.getElementById("toggle2");
const statusEl = document.getElementById("status");
const btnSubmit = document.getElementById("btnSubmit");
const goLogin = document.getElementById("goLogin");
const tokenInfo = document.getElementById("tokenInfo");
const matchHint = document.getElementById("matchHint");
const fill = document.getElementById("fill");
const strength = document.getElementById("strength");

function setStatus(type, msg) {
  statusEl.className = "status show " + (type === "ok" ? "ok" : "err");
  statusEl.textContent = msg;
}

function clearStatus() {
  statusEl.className = "status";
  statusEl.textContent = "";
}

function togglePassword(input, btn) {
  const isPwd = input.type === "password";
  input.type = isPwd ? "text" : "password";
  btn.textContent = isPwd ? "Ocultar" : "Mostrar";
}

function scorePassword(p) {
  let s = 0;
  if (!p) return 0;
  const len = Math.min(20, p.length);
  s += len * 4;

  const hasLower = /[a-z]/.test(p);
  const hasUpper = /[A-Z]/.test(p);
  const hasNum = /\d/.test(p);
  const hasSym = /[^A-Za-z0-9]/.test(p);

  s += hasLower ? 10 : 0;
  s += hasUpper ? 12 : 0;
  s += hasNum ? 12 : 0;
  s += hasSym ? 14 : 0;

  if (/^(.)\1+$/.test(p)) s -= 30;
  if (/password|123456|qwerty|admin/i.test(p)) s -= 25;

  return Math.max(0, Math.min(100, s));
}

function updateUI() {
  const p = pass1.value;
  const s = scorePassword(p);
  fill.style.width = s + "%";

  let label = "Débil";
  if (s >= 70) label = "Fuerte";
  else if (s >= 45) label = "Media";
  strength.textContent = p.length ? label : "—";

  const matches = pass2.value.length ? (pass1.value === pass2.value) : true;
  matchHint.textContent = matches ? "✔ Coinciden" : "✖ No coinciden";
  matchHint.className = "match " + (matches ? "ok" : "err");
}

toggle1.addEventListener("click", () => togglePassword(pass1, toggle1));
toggle2.addEventListener("click", () => togglePassword(pass2, toggle2));

pass1.addEventListener("input", () => { clearStatus(); updateUI(); });
pass2.addEventListener("input", () => { clearStatus(); updateUI(); });

goLogin.addEventListener("click", () => {
  window.location.href = "index.html";
});

if (!token) {
  btnSubmit.disabled = true;
  pass1.disabled = true;
  pass2.disabled = true;
  setStatus("err", "No se encontró el token en el enlace. Pedí uno nuevo.");
  tokenInfo.textContent = "";
} else {
  tokenInfo.textContent = "Token detectado. Podés continuar.";
}

updateUI();

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  clearStatus();

  if (!token) {
    setStatus("err", "Token faltante. Pedí un nuevo enlace.");
    return;
  }

  const p1 = pass1.value;
  const p2 = pass2.value;

  if (p1.length < 8) {
    setStatus("err", "La contraseña debe tener al menos 8 caracteres.");
    return;
  }
  if (p1 !== p2) {
    setStatus("err", "Las contraseñas no coinciden.");
    return;
  }

  btnSubmit.disabled = true;
  btnSubmit.textContent = "Guardando...";

  try {
    const res = await fetch(`${API_BASE}/api/auth/restablecer-contrasena`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, contrasena: p1 })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data?.error || "No se pudo restablecer la contraseña.");

    setStatus("ok", "✅ Contraseña actualizada. Ya podés iniciar sesión.");
    form.reset();
    updateUI();
  } catch (err) {
    setStatus("err", "❌ " + err.message);
  } finally {
    btnSubmit.disabled = false;
    btnSubmit.textContent = "Guardar contraseña";
  }
});
