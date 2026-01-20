(() => {
    // Helpers existentes
    const fmtCRC = n => `₡ ${Number(n || 0).toLocaleString('es-CR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const escapeHtml = (s = '') => String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));

    // Elementos
    const overlay = document.getElementById('miniCartOverlay');
    const panel = document.getElementById('miniCart');
    const listEl = document.getElementById('mcList');
    const emptyEl = document.getElementById('mcEmpty');
    const subtotalEl = document.getElementById('mcSubtotal');
    const clearBtn = document.getElementById('mcClear');
    const closeBtn = panel.querySelector('.mc-close');
    const cartBtn = document.querySelector('a.icon_btn'); // tu ícono arriba a la derecha

    let lastFocus = null;
    let debounce;

    function stepFor(qty) {
        // Si la cantidad viene con decimales -> tratamos como "kg": step 0.25
        return Number.isInteger(Number(qty)) ? 1 : 0.25;
    }
    function clampToStep(value, step) {
        const n = Math.max(step, Number(value) || step);
        const snapped = Math.round(n / step) * step;
        return step < 1 ? Number(snapped.toFixed(2)) : snapped;
    }

    // -------- API
    async function getCart() {
        const r = await window.apiFetchPublic('/api/cart', { auth: true });
        if (!r.ok) throw r;
        return r.data || {};
    }
    async function setQty(id_bolsa, cantidad) {
        if (cantidad <= 0) return delItem(id_bolsa);
        const r = await window.apiFetchPublic(`/api/cart/items/${id_bolsa}`, {
            method: 'PATCH', body: { cantidad }, auth: true
        });
        if (!r.ok) throw r;
    }
    async function delItem(id_bolsa) {
        const r = await window.apiFetchPublic(`/api/cart/items/${id_bolsa}`, {
            method: 'DELETE', auth: true
        });
        if (!r.ok && r.status !== 204) throw r;
    }
    async function clearCart() {
        const r = await window.apiFetchPublic('/api/cart', { method: 'DELETE', auth: true });
        if (!r.ok && r.status !== 204) throw r;
    }

    // -------- Render
    async function loadAndRender() {
        try {
            const cart = await getCart();
            const items = Array.isArray(cart.items) ? cart.items : [];
            renderList(items, cart.total || 0);
        } catch (e) {
            // 401 → no logueado
            renderList([], 0);
        }
    }

    function renderList(items, subtotal) {
        listEl.innerHTML = '';
        emptyEl.hidden = items.length > 0;
        panel.querySelector('.mc-footer').style.display = items.length ? '' : 'none';
        subtotalEl.textContent = fmtCRC(subtotal);

        items.forEach(it => {
            const st = stepFor(it.cantidad);
            const li = document.createElement('li');
            li.className = 'mc-item';
            li.dataset.id = it.id_bolsa;
            li.dataset.step = st;
            const meta = [
  it.tipo,
  it.subtipo,
  it.dimensiones ? `${it.dimensiones.ancho}×${it.dimensiones.alto} cm` : null
].filter(Boolean).join(' · ');

li.innerHTML = `
  <div class="mc-top">
    <div class="mc-item-info">
      <div class="mc-title">${escapeHtml(it.descripcion)}</div>
      <div class="mc-meta">${escapeHtml(meta)}</div>
    </div>
  </div>

  <div class="mc-bottom">
    <div class="mc-price">${fmtCRC(it.precio_unitario)}</div>

    <div class="mc-qty">
      <button class="mc-step" data-dir="-1" aria-label="Restar">−</button>
      <input class="mc-input" type="number" inputmode="decimal"
             step="${st}" min="${st}" value="${Number(it.cantidad)}">
      <button class="mc-step" data-dir="1" aria-label="Sumar">+</button>
    </div>

    <div class="mc-line">${fmtCRC(it.subtotal)}</div>
    <button class="mc-remove" aria-label="Eliminar">×</button>
  </div>
`;


            listEl.appendChild(li);
        });
    }

    // -------- Open/close
    function openDrawer() {
        lastFocus = document.activeElement;
        overlay.hidden = false;
        panel.setAttribute('aria-hidden', 'false');
        panel.classList.add('is-open');
        document.body.style.overflow = 'hidden';
        closeBtn.focus({ preventScroll: true });
        loadAndRender();
    }
    function closeDrawer() {
        overlay.hidden = true;
        panel.setAttribute('aria-hidden', 'true');
        panel.classList.remove('is-open');
        document.body.style.overflow = '';
        lastFocus?.focus({ preventScroll: true });
    }

    // Events
    cartBtn?.addEventListener('click', (e) => { e.preventDefault(); openDrawer(); });
    overlay?.addEventListener('click', closeDrawer);
    closeBtn?.addEventListener('click', closeDrawer);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && panel.classList.contains('is-open')) closeDrawer();
    });

    // Delegación: qty +/- , input, eliminar
    listEl.addEventListener('click', async (e) => {
        const li = e.target.closest('.mc-item'); if (!li) return;
        const id = li.dataset.id;

        if (e.target.classList.contains('mc-remove')) {
            await delItem(id);
            await loadAndRender(); await window.updateCartBadge?.();
            return;
        }
        if (e.target.classList.contains('mc-step')) {
            const dir = Number(e.target.dataset.dir);
            const input = li.querySelector('.mc-input');
            const st = Number(li.dataset.step);
            const next = clampToStep(Number(input.value) + dir * st, st);
            input.value = next;
            await setQty(id, next);
            await loadAndRender(); await window.updateCartBadge?.();
        }
    });

    listEl.addEventListener('input', (e) => {
        const input = e.target.closest('.mc-input'); if (!input) return;
        const li = input.closest('.mc-item'); const id = li.dataset.id;
        const st = Number(li.dataset.step);
        clearTimeout(debounce);
        debounce = setTimeout(async () => {
            const q = clampToStep(input.value, st);
            input.value = q;
            await setQty(id, q);
            await loadAndRender(); await window.updateCartBadge?.();
        }, 300);
    });

    clearBtn?.addEventListener('click', async () => {
        await clearCart();
        await loadAndRender(); await window.updateCartBadge?.();
    });

    // Exponer si lo quieres abrir desde otro lado
    window.openMiniCart = openDrawer;
})();

