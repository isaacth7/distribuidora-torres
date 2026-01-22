// public/JS/checkout.js
(() => {
  // ====== CONFIG ======
  const API_BASE = window.APP_CONFIG.API_BASE;
  const DEBUG = false;

  // ====== HELPERS ======
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const fmtCRC = n => `₡ ${Number(n || 0).toLocaleString('es-CR')}`;

  function readCookie(name) {
    const parts = document.cookie.split(';');
    for (const p of parts) {
      const [k, ...rest] = p.trim().split('=');
      if (k === name) return decodeURIComponent(rest.join('='));
    }
    return null;
  }
  function sniffJWTFromStorage() {
    for (const store of [localStorage, sessionStorage]) {
      for (let i = 0; i < store.length; i++) {
        const val = store.getItem(store.key(i)) || '';
        if (typeof val === 'string' && val.split('.').length === 3 && val.length > 60) return val;
      }
    }
    return '';
  }
  function getToken() {
    return (
      localStorage.getItem('token') ||
      localStorage.getItem('jwt') ||
      localStorage.getItem('access_token') ||
      sessionStorage.getItem('token') ||
      sessionStorage.getItem('jwt') ||
      readCookie('token') ||
      readCookie('access_token') ||
      sniffJWTFromStorage() ||
      ''
    );
  }
  async function fetchAuth(path, options = {}) {
    const token = getToken();
    const headers = new Headers(options.headers || {});
    headers.set('Accept', 'application/json');
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const res = await fetch(`${API_BASE}${path}`, { credentials: 'include', ...options, headers });
    if (res.status === 401) return { __unauthorized: true };
    return res;
  }

  // helper robusto para mostrar/ocultar aunque haya CSS peleón
  function show(el, yes) {
    if (!el) return;
    el.hidden = !yes;
    el.classList.toggle('is-hidden', !yes);
    el.style.display = yes ? '' : 'none';
  }

  // ====== ELEMENTOS ======
  const dlg = $('#checkoutDialog');
  const btnOpen = $('#btnCheckout');
  const btnClose = $('#ckClose');
  const addressWrap = $('#addressWrap');
  const addressSelect = $('#addressSelect');
  const sinpeWrap = $('#sinpeWrap');
  const cardWrap = $('#cardWrap');
  const pendingWrap = $('#pendingWrap');
  const sinpeReceipt = $('#sinpeReceipt');
  const rolloNotice = $('#rolloNotice');
  const btnConfirm = $('#btnConfirm');
  const btnConfirmLbl = $('#btnConfirmLabel');

  // nuevos (cupón y notas)
  const couponInput = $('#couponCode');
  const btnApplyCoupon = $('#btnApplyCoupon');
  const notesInput = $('#ckNotes');

  // ====== STATE ======
  const state = {
    preview: null,
    delivery_method: 'retiro',     // 'retiro'|'envio'|'ruta'
    address_id: null,
    payment_method: 'efectivo',    // 'efectivo'|'sinpe'|'tarjeta'
    sinpe_file: null,
    hasVariableWeight: false,
    idMap: { pago: {}, entrega: {} },
    coupon_applied: null,          // string | null
  };

  // ====== PREVIEW ======
  async function loadPreview() {
    const r = await fetchAuth('/api/orders/checkout/preview');
    if (r.__unauthorized) throw new Error('No autenticado. Inicia sesión.');
    if (!r.ok) throw new Error('No se pudo cargar el checkout');

    const data = await r.json();
    state.preview = data;

    // mapeos por slug (si existen)
    state.idMap.pago = {};
    (data.payment_methods || []).forEach(pm => (state.idMap.pago[pm.slug] = pm.id_metodo_pago));
    state.idMap.entrega = {};
    (data.delivery_types || []).forEach(dt => (state.idMap.entrega[dt.slug] = dt.id_tipo_entrega));

    // dirección por defecto
    addressSelect.innerHTML = (data.addresses || [])
      .map(a => `<option value="${a.id_direccion}">${a.label}</option>`)
      .join('');
    state.address_id = data.addresses?.[0]?.id_direccion ?? null;

    // detectar rollos por flag del preview (b.es_peso_variable)
    state.hasVariableWeight = (data.items || []).some(it => it.es_peso_variable === true || it.es_peso_variable === 1);

    if (DEBUG) console.log('[preview]', data);
  }

  // ====== RENDER ======
  function renderCart() {
    const data = state.preview || { items: [], totals: { subtotal: 0, shipping: 0, taxes: 0, total: 0 } };
    const cont = $('#ckCartList');

    if (!data.items.length) {
      cont.innerHTML = `<div class="ck-item"><div class="ck-item-title">Tu carrito está vacío.</div></div>`;
    } else {
      cont.innerHTML = data.items.map(it => `
        <div class="ck-item">
          <div class="ck-thumb">${it.imagen_url ? `<img src="${it.imagen_url}" alt="">` : ''}</div>
          <div>
            <div class="ck-item-title">${it.producto || it.descripcion_bolsa || 'Producto'}</div>
            <div class="ck-item-sub">Qty: ${Number(it.cantidad)}</div>
          </div>
          <div class="ck-item-line">${fmtCRC(Number(it.subtotal_item || (it.cantidad * it.precio_unitario) || 0))}</div>
        </div>
      `).join('');
    }

    $('#ckSubtotal').textContent = fmtCRC(data.totals.subtotal);
    $('#ckShipping').textContent = fmtCRC(data.totals.shipping);
    $('#ckTotal').textContent = fmtCRC(data.totals.total);

    // Mostrar/ocultar bloques
    updateAddressVisibility();
    updatePaymentBlocks();
    updatePrimaryButton();
  }

  function updateAddressVisibility() {
    const needAddress = state.delivery_method === 'envio' || state.delivery_method === 'ruta';
    show(addressWrap, needAddress);
  }

  function updatePaymentBlocks() {
    // Banner de rollos (estimado)
    show(rolloNotice, state.hasVariableWeight);

    if (state.hasVariableWeight) {
      show(pendingWrap, true);
      show(sinpeWrap, false);
      show(cardWrap, false);
      return;
    }
    show(pendingWrap, false);
    show(sinpeWrap, state.payment_method === 'sinpe');
    show(cardWrap, state.payment_method === 'tarjeta');
  }

  function updatePrimaryButton() {
    const total = state.preview?.totals?.total ?? 0;
    btnConfirmLbl.textContent = state.hasVariableWeight
      ? 'Confirmar pedido (total estimado)'
      : `Pagar ${fmtCRC(total)}`;
  }

  // ====== VALIDACIÓN & PAYLOAD ======
  function validateBeforeConfirm() {
    if (!state.preview?.items?.length) return { ok: false, msg: 'Tu carrito está vacío.' };
    if ((state.delivery_method === 'envio' || state.delivery_method === 'ruta') && !state.address_id)
      return { ok: false, msg: 'Selecciona una dirección.' };
    if (!state.hasVariableWeight && state.payment_method === 'sinpe' && !state.sinpe_file)
      return { ok: false, msg: 'Sube el comprobante de SINPE.' };
    return { ok: true };
  }

  function buildCheckoutJSON() {
    const entregaSlug =
      state.delivery_method === 'envio' ? 'envio' :
        state.delivery_method === 'ruta' ? 'ruta' : 'retiro';

    const id_tipo_entrega =
      state.idMap.entrega[entregaSlug] ??
      (state.delivery_method === 'envio' ? 2 : state.delivery_method === 'ruta' ? 3 : 1);

    let pagoSlug =
      state.payment_method === 'sinpe' ? 'sinpe' :
        state.payment_method === 'tarjeta' ? 'tarjeta' : 'efectivo';

    // si hay peso variable, el pago real será después (no forzamos SINPE/Tarjeta aquí)
    if (state.hasVariableWeight && state.idMap.pago['pendiente']) pagoSlug = 'pendiente';

    const id_metodo_pago =
      state.idMap.pago[pagoSlug] ??
      (pagoSlug === 'sinpe' ? 2 : pagoSlug === 'tarjeta' ? 3 : 1);

    const id_direccion =
      (state.delivery_method === 'envio' || state.delivery_method === 'ruta')
        ? Number(state.address_id) || null
        : null;

    const codigo_descuento = (couponInput?.value || '').trim() || null;
    const notas = (notesInput?.value || '').trim() || null;

    return { id_direccion, id_metodo_pago, id_tipo_entrega, codigo_descuento, notas };
  }

  async function postCheckoutJSON(payload) {
    const r = await fetchAuth('/api/orders/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (r.__unauthorized) throw new Error('No autenticado. Inicia sesión.');
    if (!r.ok) {
      let msg = 'No se pudo crear la orden';
      try { const j = await r.json(); msg = j?.error || j?.message || msg; } catch { }
      throw new Error(msg);
    }
    return r.json();
  }

  // ====== EVENTOS ======
  function wireEvents() {
    btnOpen?.addEventListener('click', async (e) => {
      e.preventDefault();
      // Estado por defecto
      state.delivery_method = 'retiro';
      state.payment_method = 'efectivo';
      state.address_id = null;
      state.sinpe_file = null;
      state.coupon_applied = null;
      if (couponInput) couponInput.value = '';
      if (notesInput) notesInput.value = '';

      try {
        await loadPreview();
        renderCart();
        dlg.showModal();
        history.replaceState(null, '', '#checkout');
      } catch (e) {
        alert(e.message || 'No se pudo abrir el checkout');
      }
    });

    btnClose?.addEventListener('click', () => {
      dlg.close();
      clearCheckoutHash();
    });

    dlg?.addEventListener('close', clearCheckoutHash);

    // Entrega
    $$('input[name="delivery_method"]').forEach(r => {
      r.addEventListener('change', () => {
        state.delivery_method = r.value;
        updateAddressVisibility();
        updatePrimaryButton();
      });
    });

    // Dirección
    addressSelect?.addEventListener('change', () => {
      state.address_id = addressSelect.value || null;
    });

    // Pago
    $$('input[name="payment_method"]').forEach(r => {
      r.addEventListener('change', () => {
        state.payment_method = r.value;
        updatePaymentBlocks();
        updatePrimaryButton();
      });
    });

    // SINPE file
    sinpeReceipt?.addEventListener('change', () => {
      state.sinpe_file = sinpeReceipt.files?.[0] || null;
    });

    // Cupón (solo setea en UI; el cálculo real lo hará el back cuando lo implementes)
    btnApplyCoupon?.addEventListener('click', () => {
      const c = (couponInput?.value || '').trim();
      if (!c) return alert('Ingresa un código.');
      state.coupon_applied = c;
      alert(`Código "${c}" aplicado (se validará al crear la orden).`);
    });

    // Confirmar
    btnConfirm.addEventListener('click', async () => {
      const v = validateBeforeConfirm();
      if (!v.ok) return alert(v.msg);

      try {
        btnConfirm.disabled = true;
        const payload = buildCheckoutJSON();
        if (DEBUG) console.log('[checkout] payload', payload);

        // NOTA: si más adelante subes comprobante SINPE, aquí arma un FormData y
        // llama a un endpoint /api/orders/sinpe-upload antes o después del checkout.
        const resp = await postCheckoutJSON(payload);

        dlg.close();
        clearCheckoutHash();
        alert(state.hasVariableWeight
          ? `Orden #${resp.id_orden} creada con total estimado. Te contactaremos con el monto final.`
          : `¡Orden #${resp.id_orden} creada exitosamente!`);
        location.href = '../HTML/Perfil.html';
      } catch (e) {
        alert(e.message || 'Error creando la orden');
      } finally {
        btnConfirm.disabled = false;
      }
    });

    function clearCheckoutHash() {
      if (location.hash === '#checkout') {
        history.replaceState(null, '', location.pathname + location.search);
      }
    }

    // Deep-link
    window.addEventListener('load', () => {
      if (location.hash === '#checkout') btnOpen?.click();
    });
  }

  // ====== INIT ======
  document.addEventListener('DOMContentLoaded', wireEvents);
})();
