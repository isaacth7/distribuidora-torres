document.addEventListener("DOMContentLoaded", () => {
  console.log("[olvido-contrasena] JS cargado ✅");

  // Ajustá esto a tu backend
  const API_BASE = "https://distribuidora-torres.onrender.com";

  const form = document.getElementById("formForgot");
  const correoInput = document.getElementById("correo");
  const btnSend = document.getElementById("btnSend");
  const statusEl = document.getElementById("status");
  const goLogin = document.getElementById("goLogin");

  if (!form || !correoInput || !btnSend || !statusEl) {
    console.error("[olvido-contrasena] Faltan elementos en el HTML:", {
      form, correoInput, btnSend, statusEl
    });
    return;
  }

  function setStatus(type, msg) {
    statusEl.className = "status show " + (type === "ok" ? "ok" : "err");
    statusEl.textContent = msg;
  }

  function clearStatus() {
    statusEl.className = "status";
    statusEl.textContent = "";
  }

  if (goLogin) {
    goLogin.addEventListener("click", () => {
      window.location.href = "Inicio.html"; // ajustá si aplica
    });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearStatus();

    const correo = correoInput.value.trim().toLowerCase();
    if (!correo) {
      setStatus("err", "Ingresá un correo válido.");
      return;
    }

    btnSend.disabled = true;
    btnSend.textContent = "Enviando...";

    try {
      console.log("[olvido-contrasena] Enviando a:", `${API_BASE}/api/auth/olvido-contrasena`);

      const res = await fetch(`${API_BASE}/api/auth/olvido-contrasena`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ correo })
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data?.error || `Error HTTP ${res.status}`);
      }

      setStatus("ok", "✅ Listo. Si el correo está registrado, te llegará un enlace para restablecer tu contraseña.");
      form.reset();
    } catch (err) {
      console.error(err);
      setStatus("err", "❌ " + err.message);
    } finally {
      btnSend.disabled = false;
      btnSend.textContent = "Enviar enlace";
    }
  });
});
