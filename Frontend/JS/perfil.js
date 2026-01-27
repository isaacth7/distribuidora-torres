/* MiPerfil.js: tabs + carga/edición de perfil + direcciones + pedidos
   Requiere:
   - apiFetchPublic(path, { method, body, auth:true })  // definido en auth.js
   - getUser() / updateUser() de auth.js
*/
(function () {
  // ---------- Utils ----------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  // ---- Pretty labels ----
  const PRETTY_ESTADO = {
    borrador: 'Borrador',
    pendiente_pesaje: 'Pendiente de pesaje',
    'pendiente-pesaje': 'Pendiente de pesaje',
    pendiente_pago: 'Pendiente de pago',
    'pendiente-pago': 'Pendiente de pago',
    pagado: 'Pagado',
    cancelado: 'Cancelado'
  };
  const PRETTY_ENTREGA = {
    retiro: 'Retiro en tienda',
    envió: 'Envío',
    envio: 'Envío',
    ruta: 'Entrega en ruta',
    domicilio: 'Domicilio'
  };
  const PRETTY_PAGO = {
    efectivo: 'Efectivo',
    sinpe: 'SINPE Móvil',
    'sinpe móvil': 'SINPE Móvil',
    tarjeta: 'Tarjeta'
  };

  const slugify = (s) =>
    String(s ?? '')
      .toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .trim()
      .replace(/\s+/g, '_');

  const pretty = (s, dict) => {
    if (!s) return '';
    const k = String(s).toLowerCase().trim();
    return dict[k] || s;
  };

  function showToast(msg, ok = true) {
    const t = $('#pdToast');
    if (!t) { alert(msg); return; }
    t.textContent = msg;
    t.style.background = ok ? 'var(--brand)' : '#c0392b';
    t.classList.add('show');
    clearTimeout(window.__pfToast);
    window.__pfToast = setTimeout(() => t.classList.remove('show'), 2400);
  }

  const notEmpty = v => {
    const s = (v ?? '').toString().trim();
    return s.length ? s : undefined;
  };

  const shallowChanged = (prev = {}, next = {}) => {
    const diff = {};
    for (const [k, v] of Object.entries(next)) {
      if (v === undefined) continue;
      const prevVal = (prev[k] ?? '').toString().trim();
      const nextVal = (v ?? '').toString().trim();
      if (prevVal !== nextVal) diff[k] = nextVal;
    }
    return diff;
  };

  const fmtCRC = n => `₡ ${Number(n ?? 0).toLocaleString('es-CR')}`;
  const fmtQty = n => `${Number(n ?? 0).toLocaleString('es-CR')}`;
  const fmtDate = iso => iso
    ? new Date(iso).toLocaleString('es-CR', { dateStyle: 'medium', timeStyle: 'short' })
    : '—';

  // Capa fina sobre apiFetchPublic
  async function authJson(path, method = 'GET', payload) {
    try { return await apiFetchPublic(path, { method, body: payload, auth: true }); }
    catch (e) { return { ok: false, status: 0, data: { error: e?.message || 'Error de red' } }; }
  }

  // ---------- Tabs / Routing ----------
  const navItems = $$('.pf-nav-item');
  const panels = $$('.pf-panel');

  function activate(tab) {
    navItems.forEach(a => a.classList.toggle('active', a.dataset.tab === tab));
    panels.forEach(p => (p.hidden = p.id !== `tab-${tab}`));
    history.replaceState(null, '', `#${tab}`);
    if (tab === 'pedidos') loadOrders().catch(e => showToast(e.message || 'No se pudieron cargar los pedidos', false));
  }
  function getInitialTab() {
    const url = new URL(location.href);
    const qtab = url.searchParams.get('tab');
    const hash = location.hash?.replace('#', '');
    return qtab || hash || 'perfil';
  }
  navItems.forEach(a => a.addEventListener('click', () => {
    activate(a.dataset.tab);

    // ✅ en móvil/ipad, cerrar menú luego de seleccionar opción
    if (window.matchMedia('(max-width: 960px)').matches) {
      $('.pf-nav')?.classList.remove('open');
    }
  }));
  $('#pfMenuToggle')?.addEventListener('click', () => $('.pf-nav')?.classList.toggle('open'));
  window.addEventListener('resize', () => {
    if (!window.matchMedia('(max-width: 960px)').matches) {
      $('.pf-nav')?.classList.remove('open');
    }
  });

  // ---------- Estado ----------
  let originalUser = null;

  // ---------- PERFIL ----------
  const pfForm = $('#pfForm');
  const pfCancel = $('#pfCancel');
  const pfPwdForm = $('#pfPwdForm');

  function fillProfileForm(u) {
    if (!u || !pfForm) return;
    pfForm.nombre.value = u.nombre ?? '';
    pfForm.primer_apellido.value = u.primer_apellido ?? '';
    pfForm.segundo_apellido.value = u.segundo_apellido ?? '';
    pfForm.correo.value = u.correo ?? '';
    pfForm.negocio.value = u.negocio ?? '';
  }

  async function loadProfile() {
    const u = (typeof getUser === 'function') ? getUser() : null;
    originalUser = u || {};
    fillProfileForm(originalUser);
  }

  pfForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!pfForm) return;

    const candidate = {
      nombre: (pfForm.nombre.value || '').trim(),
      primer_apellido: (pfForm.primer_apellido.value || '').trim(),
      segundo_apellido: (pfForm.segundo_apellido.value || '').trim(),
      correo: (pfForm.correo.value || '').trim().toLowerCase(),
      negocio: (pfForm.negocio.value || '').trim(),
    };

    const body = shallowChanged(originalUser, candidate);
    if (!Object.keys(body).length) return showToast('No hay cambios para guardar');

    const { ok, data, status } = await authJson('/api/users/me', 'PUT', body);
    if (!ok) {
      const msg =
        data?.error ||
        (status === 409 ? 'El correo ya está en uso' :
          status === 422 ? 'Revisa los datos ingresados' :
            status === 401 ? 'Sesión expirada. Inicia sesión de nuevo.' :
              `No se pudo guardar (HTTP ${status})`);
      showToast(msg, false);
      return;
    }

    const updated = (data && typeof data === 'object') ? data : { ...originalUser, ...candidate };
    originalUser = { ...originalUser, ...updated };
    try { if (typeof updateUser === 'function') updateUser(originalUser); } catch { }
    fillProfileForm(originalUser);
    showToast('Perfil actualizado');
  });

  pfCancel?.addEventListener('click', (e) => {
    e.preventDefault();
    fillProfileForm(originalUser);
    showToast('Cambios descartados');
  });

  pfPwdForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!pfPwdForm) return;

    const actual = (pfPwdForm.contrasena_actual?.value || '').trim();
    const nueva = (pfPwdForm.contrasena_nueva?.value || '').trim();
    const conf = (pfPwdForm.contrasena_confirmar?.value || '').trim();

    if (!actual || !nueva) return showToast('Completa la contraseña actual y la nueva', false);
    if (pfPwdForm.contrasena_confirmar && nueva !== conf) return showToast('La confirmación no coincide', false);
    if (nueva.length < 8) return showToast('La nueva contraseña debe tener al menos 8 caracteres', false);

    const body = { contrasena_actual: actual, contrasena_nueva: nueva };
    const { ok, status, data } = await authJson('/api/users/me/password', 'PATCH', body);
    if (!ok) {
      const msg =
        data?.error ||
        (status === 400 ? 'Solicitud inválida' :
          status === 401 ? 'Sesión expirada. Inicia sesión de nuevo.' :
            status === 403 ? 'Contraseña actual incorrecta' :
              status === 422 ? 'Contraseña nueva no válida' :
                `No se pudo cambiar la contraseña (HTTP ${status})`);
      showToast(msg, false);
      return;
    }
    pfPwdForm.reset();
    showToast('Contraseña actualizada');
  });

  // ---------- DIRECCIONES ----------
  const addrList = $('#addrList');
  const addrDialog = $('#addrDialog');
  const addrForm = $('#addrForm');

  function renderAddressCard(a) {
    const header = [a.provincia, a.canton, a.distrito].filter(Boolean).join(', ');
    const cp = (a.codigo_postal != null && a.codigo_postal !== '') ? ` · CP ${a.codigo_postal}` : '';
    const badge = a.activa ? `<span class="pf-badge">Activa</span>` : '';
    return `
      <div class="pf-card" data-id="${a.id_direccion}">
        <div>
          <strong>${header || '—'}</strong> ${badge}<br>
          ${a.direccion_exacta || ''}${cp}
        </div>
        <div class="pf-card-actions">
          <button class="pf-btn ghost" data-edit>Editar</button>
          <button class="pf-btn" data-delete>Eliminar</button>
        </div>
      </div>`;
  }

  function fillAddressForm(a = {}) {
    const f = addrForm; if (!f) return;
    f.reset?.();
    f.querySelector('[name="id_direccion"]').value = a?.id_direccion ?? '';
    f.querySelector('[name="direccion_exacta"]').value = a?.direccion_exacta ?? '';
    f.querySelector('[name="provincia"]').value = a?.provincia ?? '';
    f.querySelector('[name="canton"]').value = a?.canton ?? '';
    f.querySelector('[name="distrito"]').value = a?.distrito ?? '';
    f.querySelector('[name="codigo_postal"]').value =
      (a?.codigo_postal ?? '') === null ? '' : (a?.codigo_postal ?? '');
    f.querySelector('[name="activa"]').checked = !!a?.activa;
  }

  function readAddressForm() {
    const f = addrForm; if (!f) return {};
    const get = (n) => f.querySelector(`[name="${n}"]`);
    const cp = (get('codigo_postal').value || '').trim();
    return {
      id_direccion: get('id_direccion').value || undefined,
      direccion_exacta: (get('direccion_exacta').value || '').trim(),
      provincia: (get('provincia').value || '').trim(),
      canton: (get('canton').value || '').trim(),
      distrito: (get('distrito').value || '').trim(),
      codigo_postal: cp === '' ? null : Number(cp),
      activa: get('activa').checked,
    };
  }

  async function loadAddresses() {
    if (!addrList) return;
    const { ok, data, status } = await authJson('/api/direcciones', 'GET');
    if (!ok) return addrList.innerHTML = `<div class="pf-hint">No se pudieron cargar tus direcciones (HTTP ${status})</div>`;
    if (!Array.isArray(data) || data.length === 0)
      return addrList.innerHTML = `<div class="pf-hint">Aún no tienes direcciones guardadas.</div>`;
    addrList.innerHTML = data.map(renderAddressCard).join('');
  }

  function openAddrDialog(addr) {
    fillAddressForm(addr);
    try { addrDialog?.showModal(); } catch { addrDialog?.setAttribute('open', ''); }
  }

  async function fetchAddress(id) {
    const { ok, data } = await authJson(`/api/direcciones/${encodeURIComponent(id)}`, 'GET');
    return ok ? data : null;
  }

  addrForm?.addEventListener('submit', async (e) => {
    const action = e.submitter?.value;  // "save" o "cancel"
    if (action !== 'save') { e.preventDefault(); addrDialog?.close?.(); return; }
    e.preventDefault();

    const body = readAddressForm();
    if (!body.direccion_exacta || !body.provincia || !body.canton || !body.distrito)
      return showToast('Completa dirección, provincia, cantón y distrito', false);

    let res;
    if (body.id_direccion) {
      const id = body.id_direccion; delete body.id_direccion;
      res = await authJson(`/api/direcciones/${encodeURIComponent(id)}`, 'PUT', body);
    } else {
      res = await authJson('/api/direcciones', 'POST', body);
    }

    if (!res.ok) return showToast(res.data?.error || `No se pudo guardar (HTTP ${res.status})`, false);
    addrDialog?.close(); showToast('Dirección guardada'); loadAddresses();
  });

  addrList?.addEventListener('click', async (e) => {
    const card = e.target.closest('.pf-card'); if (!card) return;
    const id = card.dataset.id;

    if (e.target.closest('[data-edit]')) {
      const addr = await fetchAddress(id);
      openAddrDialog(addr || { id_direccion: id });
    }

    if (e.target.closest('[data-delete]')) {
      if (!confirm('¿Eliminar esta dirección?')) return;
      const { ok, status, data } = await authJson(`/api/direcciones/${encodeURIComponent(id)}`, 'DELETE');
      if (!ok) return showToast(data?.error || `No se pudo eliminar (HTTP ${status})`, false);
      showToast('Dirección eliminada');
      card.remove();
      if (!addrList.children.length) loadAddresses();
    }
  });

  // ---------- PEDIDOS ----------
  const ordersList = $('#ordersList');

  // Chip de estado: muestra texto bonito, color por slug
  function statusChip(rawName = '') {
    const slug = slugify(rawName);
    const label = pretty(rawName, PRETTY_ESTADO) || '—';
    const map = {
      pendiente_pago: '#f39c12',
      pendiente_pesaje: '#8e44ad',
      borrador: '#7f8c8d',
      pagado: '#27ae60',
      en_preparacion: '#2980b9',
      en_ruta: '#16a085',
      completado: '#2ecc71',
      cancelado: '#c0392b',
    };
    const bg = map[slug] || '#658c4a';
    return `<span class="pf-btn" style="background:${bg};border-color:${bg};color:#fff;padding:6px 10px;border-radius:999px;font-size:12px;line-height:1;">${label}</span>`;
  }

  async function loadOrders() {
    if (!ordersList) return;
    ordersList.innerHTML = `<div class="pf-card">Cargando tus pedidos…</div>`;

    const { ok, data, status } = await authJson('/api/orders', 'GET');
    if (!ok) {
      ordersList.innerHTML = `<div class="pf-card">No se pudieron obtener las órdenes (HTTP ${status})</div>`;
      return;
    }
    if (!Array.isArray(data) || !data.length) {
      ordersList.innerHTML = `<div class="pf-card">Aún no tienes pedidos.</div>`;
      return;
    }

    ordersList.innerHTML = data.map(o => {
      const total = o.gran_total != null ? fmtCRC(o.gran_total) : '—';
      const fecha = fmtDate(o.fecha);
      const entregaTxt = pretty(o.tipo_entrega, PRETTY_ENTREGA) || '—';
      const pagoTxt = pretty(o.metodo_pago, PRETTY_PAGO) || '—';

      return `
        <div class="pf-card" data-id="${o.id_orden}">
          <div>
            <div style="font-weight:700;">Pedido #${o.id_orden}</div>
            <div style="color:var(--muted);font-size:13px;">${fecha}</div>
            <div style="margin-top:6px;display:flex;gap:8px;flex-wrap:wrap;">
              ${statusChip(o?.estado?.nombre)}
              <span class="pf-btn ghost" style="border-radius:999px;padding:6px 10px;font-size:12px;">${pagoTxt}</span>
              <span class="pf-btn ghost" style="border-radius:999px;padding:6px 10px;font-size:12px;">${entregaTxt}</span>
            </div>
          </div>
          <div class="pf-card-actions">
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:8px;">
              <div style="font-weight:800;">${total}</div>
              <button class="pf-btn primary pf-order-detail" data-id="${o.id_orden}">Ver detalle</button>
            </div>
          </div>
        </div>`;
    }).join('');

    // Wire "Ver detalle"
    $$('.pf-order-detail', ordersList).forEach(btn => {
      btn.addEventListener('click', () => openOrderDetail(parseInt(btn.dataset.id, 10)));
    });
  }

  // ---- Detalle (dialog dinámico) ----
  let detailDialog = null;
  function ensureDetailDialog() {
    if (detailDialog) return detailDialog;
    const dlg = document.createElement('dialog');
    dlg.className = 'pf-dialog';
    dlg.id = 'orderDetailDialog';
    dlg.innerHTML = `
      <form method="dialog" class="pf-form" id="odForm">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
          <h3 style="margin:0;">Detalle del pedido</h3>
          <button class="pf-btn ghost" value="close">Cerrar</button>
        </div>
        <div id="odBody" style="margin-top:12px;"></div>
      </form>`;
    document.body.appendChild(dlg);
    detailDialog = dlg;
    return dlg;
  }

  async function openOrderDetail(id) {
    const dlg = ensureDetailDialog();
    $('#odBody', dlg).innerHTML = `Cargando…`;
    try { dlg.showModal(); } catch { dlg.setAttribute('open', ''); }

    const det = await authJson(`/api/orders/${id}`, 'GET');
    if (!det.ok) {
      $('#odBody', dlg).innerHTML = `No se pudo obtener el detalle (HTTP ${det.status})`;
      return;
    }
    const o = det.data;

    // Comprobantes
    let comps = [];
    const lc = await authJson(`/api/orders/${id}/comprobantes`, 'GET');
    if (lc.ok && Array.isArray(lc.data)) comps = lc.data;

    const itemsHTML = (o.items || []).map(it => `
      <tr>
        <td>${it.descripcion_bolsa || 'Producto'}</td>
        <td>${it.dimensiones ? `${it.dimensiones.ancho}×${it.dimensiones.alto}` : ''}</td>
        <td style="text-align:right;">${fmtQty(it.cantidad)}</td>
        <td style="text-align:right;">${it.precio_unitario != null ? fmtCRC(it.precio_unitario) : (o.flags?.tiene_peso_variable ? '—' : '')}</td>
        <td style="text-align:right;">${it.subtotal != null ? fmtCRC(it.subtotal) : '—'}</td>
      </tr>
    `).join('');

    const tot = o.totales || {};
    const peso = o.pesos || {};
    const esEst = o.flags?.tiene_peso_variable && (tot.subtotal_final == null);

    const entregaTxt = pretty(o.entrega?.nombre, PRETTY_ENTREGA) || '—';
    const pagoTxt = pretty(o.pago?.nombre, PRETTY_PAGO) || '—';

    const address = o.direccion?.id ? `
      <div style="margin-top:6px;color:var(--muted);font-size:13px;">
        ${[o.direccion?.provincia, o.direccion?.canton, o.direccion?.distrito].filter(Boolean).join(', ')} · ${o.direccion?.direccion_exacta || ''}
      </div>` : '';

    const compList = comps.length
      ? comps.map(c => `
          <div class="pf-card" style="padding:10px 12px;">
            <div>
              <div><a href="${c.url_archivo}" target="_blank" rel="noopener">${c.nombre_archivo || 'Archivo'}</a></div>
              <div style="color:var(--muted);font-size:12px;">${c.tipo_mime} · ${(c.tamano_bytes / 1024).toFixed(0)} KB · ${fmtDate(c.subido_en)}</div>
            </div>
            <div>${statusChip(c.estado)}</div>
          </div>`).join('')
      : `<div class="od-empty">Sin comprobantes aún.</div>`;

    // Condición para (re)subir comprobante
    const estadoSlug = slugify(o?.estado?.nombre);
    const puedeSubir = (estadoSlug === 'pendiente_pago');

    const subirHTML = puedeSubir ? `
  <div class="od-upload">
    <label>
      Subir comprobante (imagen o PDF)
      <input type="file" id="odComprobante" accept="image/*,application/pdf">
    </label>
    <button type="button" class="pf-btn primary" id="odUploadBtn">Enviar comprobante</button>
  </div>
` : '';

    $('#odBody', dlg).innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <div>
          <div style="font-weight:800;">Pedido #${o.id_orden}</div>
          <div style="color:var(--muted);font-size:13px;">${fmtDate(o.fecha)}</div>
          <div style="margin-top:6px;display:flex;gap:8px;flex-wrap:wrap;">
            ${statusChip(o?.estado?.nombre)}
            <span class="pf-btn ghost" style="border-radius:999px;padding:6px 10px;font-size:12px;">${entregaTxt}</span>
            <span class="pf-btn ghost" style="border-radius:999px;padding:6px 10px;font-size:12px;">${pagoTxt}</span>
          </div>
          ${address}
        </div>
        <div style="text-align:right;">
          <div style="font-weight:900;font-size:18px;">${fmtCRC(o?.totales?.gran_total)}</div>
          ${esEst ? `<div style="color:#8e44ad;font-size:12px;margin-top:4px;">Total estimado (orden con rollos)</div>` : ''}
        </div>
      </div>

      <hr class="pf-sep">

      <div class="pf-sheet" style="box-shadow:none;padding:16px;">
        <h4 style="margin:0 0 10px;">Artículos</h4>
          <div class="od-table-wrap">
            <table style="width:100%;border-collapse:collapse;">
            <thead>
              <tr style="text-align:left;border-bottom:1px solid var(--border);">
                <th style="padding:8px 4px;">Producto</th>
                <th style="padding:8px 4px;">Dimensiones</th>
                <th style="padding:8px 4px;text-align:right;">Cantidad</th>
                <th style="padding:8px 4px;text-align:right;">Precio</th>
                <th style="padding:8px 4px;text-align:right;">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHTML || `<tr><td colspan="5" style="padding:8px 4px;">Sin ítems.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr;gap:12px;margin-top:12px;">
        <div class="pf-card od-totals-card">
          <h4 class="od-sec-title">Totales</h4>
          <div class="pf-card-list od-kv">
            <div class="pf-line"><span>Subtotal (est. máx.)</span> <strong>${tot.subtotal_est_max != null ? fmtCRC(tot.subtotal_est_max) : '—'}</strong></div>
            <div class="pf-line"><span>Subtotal final</span> <strong>${tot.subtotal_final != null ? fmtCRC(tot.subtotal_final) : '—'}</strong></div>
            <div class="pf-line"><span>Descuento</span> <strong>− ${fmtCRC(tot.descuento_total || 0)}</strong></div>
            <div class="pf-line"><span>Envío</span> <strong>${fmtCRC(tot.envio_total || 0)}</strong></div>
            <div class="pf-line"><span>Impuestos</span> <strong>${fmtCRC(tot.impuesto_total || 0)}</strong></div>
            <hr class="pf-sep thin">
            <div class="pf-line" style="font-weight:900;"><span>Total</span> <strong>${fmtCRC(tot.gran_total || 0)}</strong></div>
          </div>
          ${(o.flags?.tiene_peso_variable || peso?.real_total_kg != null)
        ? `<div class="od-weight">
                 <div><strong>Peso máximo estimado:</strong> ${peso?.max_total_kg ?? '—'} kg</div>
                 <div><strong>Peso real:</strong> ${peso?.real_total_kg ?? '—'} kg</div>
               </div>` : ''}
        </div>

        <div class="pf-card" style="padding:12px;">
          <h4 style="margin:0 0 8px;">Comprobantes</h4>
          <div id="odComps" class="od-comps-list">${compList}</div>
          ${subirHTML}
        </div>
      </div>
    `;

    // Subida/re-subida de comprobante (multipart)
    const uploadBtn = $('#odUploadBtn', dlg);
    if (uploadBtn) {
      uploadBtn.addEventListener('click', async () => {
        const file = $('#odComprobante', dlg)?.files?.[0];
        if (!file) return showToast('Selecciona un archivo', false);

        try {
          uploadBtn.disabled = true;
          const fd = new FormData();
          fd.append('archivo', file);

          // Usamos apiFetchPublic tal cual (no JSON)
          const resp = await apiFetchPublic(`/api/orders/${id}/comprobantes`, {
            method: 'POST',
            body: fd,
            auth: true
          });
          if (!resp.ok) {
            const msg = resp.data?.error || 'No se pudo subir el comprobante';
            throw new Error(msg);
          }

          showToast('Comprobante enviado');
          // Refrescar comprobantes
          const lc2 = await authJson(`/api/orders/${id}/comprobantes`, 'GET');
          const nuevos = lc2.ok ? lc2.data : [];
          const nuevoHTML = nuevos.length
            ? nuevos.map(c => `
                <div class="pf-card" style="padding:10px 12px;">
                  <div>
                    <div><a href="${c.url_archivo}" target="_blank" rel="noopener">${c.nombre_archivo || 'Archivo'}</a></div>
                    <div style="color:var(--muted);font-size:12px;">${c.tipo_mime} · ${(c.tamano_bytes / 1024).toFixed(0)} KB · ${fmtDate(c.subido_en)}</div>
                  </div>
                  <div>${statusChip(c.estado)}</div>
                </div>`).join('')
            : `<div class="od-empty">Sin comprobantes aún.</div>`;
          $('#odComps', dlg).innerHTML = nuevoHTML;

          // Refrescar listado por si algún indicador cambia
          loadOrders().catch(() => { });
        } catch (err) {
          showToast(err.message || 'Error al subir comprobante', false);
        } finally {
          uploadBtn.disabled = false;
        }
      });
    }
  }

  // ---------- Init ----------
  document.addEventListener('DOMContentLoaded', () => {
    const firstTab = getInitialTab();
    activate(firstTab);
    loadProfile();
    loadAddresses();
    if (firstTab === 'pedidos') loadOrders();

    // Abrir diálogo de direcciones (nuevo)
    document.addEventListener('click', (e) => {
      const newBtn = e.target.closest('#addrNew');
      if (!newBtn) return;
      e.preventDefault();
      fillAddressForm(null);
      try { addrDialog.showModal(); } catch { addrDialog.setAttribute('open', ''); }
    });

    addrDialog?.addEventListener('close', () => addrForm?.reset());
  });
})();
