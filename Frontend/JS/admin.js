/* Panel Admin UI (visual + wiring básico)
   Requiere:
   - apiFetchPublic(path, { method, body, auth:true })
*/
(function () {
    const $ = (s, r = document) => r.querySelector(s);
    const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

    const fmtCRC = n => `₡ ${Number(n ?? 0).toLocaleString('es-CR')}`;
    const fmtDate = iso => iso ? new Date(iso).toLocaleString('es-CR', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
    const slug = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, '_');

    // Toast
    function toast(msg, ok = true) {
        const t = $('#adToast'); if (!t) { alert(msg); return; }
        t.textContent = msg;
        t.style.background = ok ? 'var(--brand)' : '#c0392b';
        t.classList.add('show');
        clearTimeout(window.__adToast);
        window.__adToast = setTimeout(() => t.classList.remove('show'), 2400);
    }

    // Nav
    const nav = $('.ad-nav');
    $('#adMenuToggle')?.addEventListener('click', () => nav?.classList.toggle('open'));
    $$('.ad-nav-item').forEach(a => {
        a.addEventListener('click', () => {
            $$('.ad-nav-item').forEach(x => x.classList.remove('active'));
            a.classList.add('active');
            const tab = a.dataset.tab;
            $$('.ad-panel').forEach(p => p.hidden = (p.id !== `tab-${tab}`));
            if (tab === 'orders') loadOrders(1);
            if (tab === 'users') loadUsers(1);
            if (tab === 'dashboard') loadDashboard();
        });
    });
    $('[data-go="orders"]')?.addEventListener('click', () => {
        document.querySelector('.ad-nav-item[data-tab="orders"]').click();
    });

    // Topbar
    $('#adRefresh')?.addEventListener('click', () => {
        const current = document.querySelector('.ad-nav-item.active')?.dataset.tab || 'dashboard';
        if (current === 'orders') loadOrders();
        else if (current === 'users') loadUsers();
        else if (current === 'dashboard') loadDashboard();
        else if (current === 'media') { /* no-op */ }
    });
    $('#adLogout')?.addEventListener('click', () => {
        try { localStorage.removeItem('token'); } catch { } // o tu método de logout
        location.href = '../HTML/index.html';
    });

    // =======================
    // DASHBOARD
    // =======================
    async function loadDashboard() {
        $('#kpiOrdersToday').textContent = '—';
        $('#kpiPendingPay').textContent = '—';
        $('#kpiPendingWeight').textContent = '—';
        $('#kpiAmount').textContent = '—';

        try {
            const resp = await apiFetchPublic('/api/admin/orders?page=1&pageSize=10&sort=fecha_desc', { method: 'GET', auth: true });
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const data = Array.isArray(resp.data?.items) ? resp.data.items : [];

            const today = new Date().toDateString();
            const kToday = data.filter(x => new Date(x.fecha).toDateString() === today).length;
            const kPPago = data.filter(x => slug(x.estado) === 'pendiente_pago').length;
            const kPPes = data.filter(x => slug(x.estado) === 'pendiente_pesaje').length;
            const kAmt = data.reduce((acc, x) => acc + Number(x.total || 0), 0);

            $('#kpiOrdersToday').textContent = kToday;
            $('#kpiPendingPay').textContent = kPPago;
            $('#kpiPendingWeight').textContent = kPPes;
            $('#kpiAmount').textContent = fmtCRC(kAmt);

            renderOrdersTable('#dashLastOrders', data, { compact: true, showPager: false });
        } catch {
            $('#dashLastOrders').innerHTML = `<div class="ad-card">No se pudieron cargar las últimas órdenes.</div>`;
        }
    }

    // =======================
    // ORDERS
    // =======================
    const ordFilters = $('#ordFilters');
    ordFilters?.addEventListener('submit', (e) => { e.preventDefault(); loadOrders(1); });
    ordFilters?.addEventListener('reset', (e) => { setTimeout(() => loadOrders(1), 0); });

    function chipEstado(name) {
        const s = slug(name);

        const colors = {
            pendiente_de_pago: '#F59E0B',
            pendiente_pago: '#F59E0B',

            pendiente_de_pesaje: '#7C3AED',
            pendiente_pesaje: '#7C3AED',

            pagado: '#16A34A',
            preparando: '#2563EB',
            enviado: '#06B6D4',
            completado: '#15803D',

            reembolsado_total: '#64748B',
            reembolsado_parcial: '#94A3B8',

            cancelado: '#DC2626'
        };

        const labels = {
            pendiente_de_pago: 'Pendiente de pago',
            pendiente_pago: 'Pendiente de pago',

            pendiente_de_pesaje: 'Pendiente de pesaje',
            pendiente_pesaje: 'Pendiente de pesaje',

            pagado: 'Pagado',
            preparando: 'Preparando',
            enviado: 'Enviado',
            completado: 'Completado',

            reembolsado_total: 'Reembolso total',
            reembolsado_parcial: 'Reembolso parcial',

            cancelado: 'Cancelado'
        };

        const bg = colors[s] || 'var(--brand)';
        return `<span class="ad-chip" style="background:${bg}">${labels[s] || (name || '—')}</span>`;
    }

    function renderOrdersTable(target, rows) {
        const wrap = (typeof target === 'string') ? $(target) : target;
        if (!rows?.length) { wrap.innerHTML = `<div class="ad-card">Sin resultados.</div>`; return; }
        wrap.innerHTML = `
    <table class="ad-table">
      <thead>
        <tr>
          <th>ID</th>
          <th>Fecha</th>
          <th>Cliente</th>
          <th>Pago</th>
          <th>Entrega</th>
          <th>Estado</th>
          <th style="text-align:right;">Total</th>
          <th style="text-align:right;">Acciones</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(o => `
          <tr data-id="${o.id_orden}">
            <td>#${o.id_orden}</td>
            <td>${fmtDate(o.fecha)}</td>
            <td>${o.correo || '—'}</td>
            <td>${o.metodo_pago || '—'}</td>
            <td>${o.tipo_entrega || '—'}</td>
            <td>${chipEstado(o.estado)}</td>
            <td style="text-align:right;">${o.total != null ? fmtCRC(o.total) : '—'}</td>
            <td style="text-align:right;">
              <div class="ad-row-actions">
                <button class="ad-btn ghost" data-view>Ver</button>
                <button class="ad-btn" data-status>Cambiar estado</button>
              </div>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

        wrap.querySelectorAll('[data-view]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.closest('tr')?.dataset.id;
                if (!id) return;
                openAdminOrderDetail(id);
            });
        });


        wrap.querySelectorAll('[data-status]').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.closest('tr')?.dataset.id;
                if (!id) return;
                const dlg = $('#dlgStatus');
                $('#formStatus [name="id_orden"]').value = id;
                try { dlg.showModal(); } catch { dlg.setAttribute('open', ''); }
            });
        });
    }

    let ordPage = 1, ordTotal = 0, ordPageSize = 20;
    async function loadOrders(page = ordPage) {
        ordPage = page;
        const q = new URLSearchParams();
        const f = Object.fromEntries(new FormData(ordFilters || document.createElement('form')));

        if (f.q) q.set('q', f.q.trim());
        if (f.estado) q.set('estado', f.estado);
        if (f.pago) q.set('pago', f.pago);
        if (f.entrega) q.set('entrega', f.entrega);
        if (f.desde) q.set('fechaDesde', f.desde);
        if (f.hasta) q.set('fechaHasta', f.hasta);
        q.set('sort', 'fecha_desc');
        q.set('page', page);
        q.set('pageSize', ordPageSize);

        try {
            const r = await apiFetchPublic(`/api/admin/orders?${q.toString()}`, { method: 'GET', auth: true });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const items = r.data?.items || r.data || [];
            ordTotal = Number(r.data?.total ?? items.length);
            renderOrdersTable('#ordersTable', items);
            renderPager('#ordersPager', page, ordTotal, ordPageSize, loadOrders);
        } catch (e) {
            $('#ordersTable').innerHTML = `<div class="ad-card">No se pudieron listar las órdenes.</div>`;
            $('#ordersPager').innerHTML = '';
        }
    }

    // Cambiar estado (PATCH /api/admin/orders/{id}/status)
    $('#formStatus')?.addEventListener('submit', async (e) => {
        const btn = e.submitter?.value;
        if (btn !== 'ok') return; // cancel
        e.preventDefault();
        const id = $('#formStatus [name="id_orden"]').value;
        const val = $('#formStatus [name="id_estado"]').value;
        try {
            // Si tu endpoint usa id_estado numérico, adapta el body aquí:
            const body = { id_estado: Number(val) };
            const r = await apiFetchPublic(`/api/admin/orders/${id}/status`, { method: 'PATCH', body, auth: true });
            if (!r.ok) throw new Error(r.data?.error || `HTTP ${r.status}`);
            toast('Estado actualizado');
            $('#dlgStatus').close();
            loadOrders();
        } catch (err) {
            toast(err.message || 'No se pudo actualizar', false);
        }
    });

    // =======================
    // MEDIA (imagenes_subtipos)
    // =======================
    const mediaPicker = $('#mediaPicker');
    const mediaGrid = $('#mediaGrid');
    const dlgImage = $('#dlgImage');

    const mediaSubtipoSelect = $('#mediaSubtipo');

    function getSelectedSubtipoId() {
        // sirve tanto para input como para select, pero acá ya es select
        return mediaPicker?.elements?.id_subtipo?.value || '';
    }

    /** Cargar subtipos para el select */
    async function loadSubtiposForMediaSelect() {
        if (!mediaSubtipoSelect) return;

        // si ya está cargado, no lo vuelvas a pedir (opcional)
        if (mediaSubtipoSelect.dataset.loaded === '1') return;

        mediaSubtipoSelect.innerHTML = `<option value="" selected disabled>Cargando subtipos…</option>`;

        try {
            /**
             * ⚠️ Ajusta este endpoint según tu backend.
             * Ideal: un endpoint admin que liste subtipos con id + nombre + (tipo).
             * Ejemplos posibles:
             *  - /api/admin/subtipos
             *  - /api/subtipos
             *  - /api/catalogo/subtipos
             */
            const r = await apiFetchPublic(`/api/admin/subtipos-bolsas`, { method: 'GET', auth: true });
            if (!r.ok) throw new Error(r.data?.error || `HTTP ${r.status}`);

            const items = r.data?.items || r.data || [];

            if (!items.length) {
                mediaSubtipoSelect.innerHTML = `<option value="" selected disabled>No hay subtipos</option>`;
                return;
            }

            // Render: puedes personalizar el label a tu gusto
            mediaSubtipoSelect.innerHTML = `
      <option value="" selected disabled>Selecciona un subtipo…</option>
      ${items.map(s => {
                const id = s.id_subtipo_bolsa ?? s.id_subtipo ?? s.id ?? '';
                const nombre =
                    s.nombre_subtipo_bolsa ??
                    s.nombre_subtipo ??
                    s.subtipo_nombre ??
                    s.nombre ??
                    `Subtipo #${id || '?'}`;

                // nombres posibles del tipo
                const tipo =
                    s.tipo_nombre ??
                    s.nombre_bolsa ??
                    s.nombre_tipo ??
                    s.tipo ??
                    '';

                const label = tipo ? `${tipo} — ${nombre}` : nombre;
                return `<option value="${id}">${label}</option>`;
            }).join('')}

    `;

            mediaSubtipoSelect.dataset.loaded = '1';
        } catch (e) {
            console.error(e);
            mediaSubtipoSelect.innerHTML = `<option value="" selected disabled>Error cargando subtipos</option>`;
            toast('No se pudieron cargar los subtipos', false);
        }
    }

    function renderMedia(items) {
        if (!items?.length) {
            mediaGrid.innerHTML = `<div class="ad-card">Sin imágenes para este subtipo.</div>`;
            return;
        }

        mediaGrid.innerHTML = items.map(i => `
    <div class="ad-media-card" data-id="${i.id_imagen}">
      <img src="${i.url_imagen}" alt="${i.descripcion || ''}">
      <div class="ad-media-body">
        <div style="font-size:12px;">
          <div style="font-weight:800;">Orden #${i.orden ?? '—'}</div>
          <div style="font-size:11px;color:var(--muted);">ID: ${i.id_imagen}</div>
          <div style="color:var(--muted);">${i.descripcion || '—'}</div>
        </div>
        <div class="ad-row-actions">
          <button class="ad-btn ghost" data-edit>Editar</button>
          <button class="ad-btn danger" data-del>Eliminar</button>
        </div>
      </div>
    </div>
  `).join('');

        mediaGrid.querySelectorAll('[data-del]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const card = btn.closest('.ad-media-card');
                const id = card?.dataset.id;
                if (!id) return;
                if (!confirm('¿Eliminar imagen?')) return;

                try {
                    const r = await apiFetchPublic(`/api/admin/imagenes/${id}`, { method: 'DELETE', auth: true });
                    if (!r.ok) throw new Error(r.data?.error || `HTTP ${r.status}`);
                    toast('Imagen eliminada');
                    card.remove();
                } catch (e) {
                    toast(e.message || 'No se pudo eliminar', false);
                }
            });
        });

        mediaGrid.querySelectorAll('[data-edit]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const card = btn.closest('.ad-media-card');
                const id = card?.dataset.id;
                if (!id) return;

                $('#dlgImageTitle').textContent = `Editar imagen #${id}`;
                $('#formImage [name="id_subtipo"]').value = getSelectedSubtipoId();
                $('#formImage [name="url_imagen"]').value = '';
                $('#formImage [name="descripcion"]').value =
                    card.querySelector('.ad-media-body div:nth-child(1) div:nth-child(2)')?.textContent || '';
                $('#formImage [name="orden"]').value = 1;

                toggleImageMode('url');

                try { dlgImage.showModal(); } catch { dlgImage.setAttribute('open', ''); }
                dlgImage.dataset.mode = 'update';
                dlgImage.dataset.id = id;
            });
        });
    }

    function toggleImageMode(mode) { // 'url' | 'file'
        $(`#formImage [data-mode="url"]`).hidden = (mode !== 'url');
        $(`#formImage [data-mode="file"]`).hidden = (mode !== 'file');
    }

    mediaPicker?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = getSelectedSubtipoId();
        if (!id) return toast('Selecciona un subtipo', false);

        try {
            const r = await apiFetchPublic(`/api/admin/subtipos/${id}/imagenes`, { method: 'GET', auth: true });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            renderMedia(r.data?.items || r.data || []);
        } catch (e) {
            mediaGrid.innerHTML = `<div class="ad-card">No se pudieron listar las imágenes.</div>`;
        }
    });

    $('#mediaNewUrl')?.addEventListener('click', () => {
        const id = getSelectedSubtipoId();
        if (!id) return toast('Selecciona un subtipo', false);

        $('#dlgImageTitle').textContent = 'Nueva imagen por URL';
        $('#formImage').reset();
        $('#formImage [name="id_subtipo"]').value = id;

        toggleImageMode('url');
        try { dlgImage.showModal(); } catch { dlgImage.setAttribute('open', ''); }
        dlgImage.dataset.mode = 'create-url';
    });

    $('#mediaUpload')?.addEventListener('click', () => {
        const id = getSelectedSubtipoId();
        if (!id) return toast('Selecciona un subtipo', false);

        $('#dlgImageTitle').textContent = 'Subir imagen';
        $('#formImage').reset();
        $('#formImage [name="id_subtipo"]').value = id;

        toggleImageMode('file');
        try { dlgImage.showModal(); } catch { dlgImage.setAttribute('open', ''); }
        dlgImage.dataset.mode = 'upload';
    });

    $('#formImage')?.addEventListener('submit', async (e) => {
        const action = e.submitter?.value;
        if (action !== 'ok') return;
        e.preventDefault();

        const mode = dlgImage.dataset.mode;
        const idSub = $('#formImage [name="id_subtipo"]').value;

        try {
            if (mode === 'create-url') {
                const payload = {
                    url_imagen: $('#formImage [name="url_imagen"]').value.trim(),
                    descripcion: $('#formImage [name="descripcion"]').value.trim() || null,
                    orden: Number($('#formImage [name="orden"]').value || 1)
                };
                const r = await apiFetchPublic(`/api/admin/subtipos/${idSub}/imagenes`, { method: 'POST', body: payload, auth: true });
                if (!r.ok) throw new Error(r.data?.error || `HTTP ${r.status}`);
                toast('Imagen creada');

            } else if (mode === 'upload') {
                const f = $('#formImage [name="file"]').files[0];
                if (!f) throw new Error('Selecciona un archivo');

                const fd = new FormData();
                fd.append('file', f);
                fd.append('descripcion', $('#formImage [name="descripcion"]').value.trim());
                fd.append('orden', $('#formImage [name="orden"]').value || 1);

                const r = await apiFetchPublic(`/api/admin/subtipos/${idSub}/imagenes/upload`, { method: 'POST', body: fd, auth: true });
                if (!r.ok) throw new Error(r.data?.error || `HTTP ${r.status}`);
                toast('Imagen subida');

            } else if (mode === 'update') {
                const id = dlgImage.dataset.id;

                const urlRaw = $('#formImage [name="url_imagen"]').value.trim();
                const descRaw = $('#formImage [name="descripcion"]').value.trim();
                const ordRaw = $('#formImage [name="orden"]').value;

                // ✅ solo manda lo que el usuario realmente cambió
                const payload = {};
                if (urlRaw) payload.url_imagen = urlRaw;              // si está vacío, NO lo mandes
                if (descRaw) payload.descripcion = descRaw;           // si está vacío, NO lo mandes
                if (ordRaw !== '' && ordRaw != null) payload.orden = Number(ordRaw);

                // si no hay nada para actualizar, no pegues al backend
                if (!Object.keys(payload).length) {
                    toast('No hay cambios para guardar', false);
                    return;
                }

                const r = await apiFetchPublic(`/api/admin/imagenes/${id}`, {
                    method: 'PUT',
                    body: payload,
                    auth: true
                });

                if (!r.ok) throw new Error(r.data?.error || `HTTP ${r.status}`);
                toast('Imagen actualizada');
            }


            dlgImage.close();
            mediaPicker.requestSubmit(); // recargar grilla
        } catch (err) {
            toast(err.message || 'No se pudo guardar la imagen', false);
        }
    });

    /**
     * ✅ Importante: llama a esto cuando abras el tab media.
     * Si tú tienes un "switchTab('media')" o click de nav, ponlo ahí.
     * Si no, ponlo al cargar la página:
     */
    loadSubtiposForMediaSelect();


    // =======================
    // USERS
    // =======================
    const usrFilters = $('#usrFilters');
    usrFilters?.addEventListener('submit', (e) => { e.preventDefault(); loadUsers(1); });

    let usrPage = 1, usrTotal = 0, usrPageSize = 20;

    function renderUsersTable(rows) {
        const cont = $('#usersTable');
        if (!rows?.length) { cont.innerHTML = `<div class="ad-card">Sin usuarios.</div>`; return; }

        cont.innerHTML = `
    <table class="ad-table">
      <thead>
        <tr>
          <th>ID</th>
          <th>Nombre</th>
          <th>Correo</th>
          <th>Negocio</th>
          <th>Rol</th>
          <th>Creado</th>
          <th style="text-align:right;">Acciones</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(u => `
          <tr data-id="${u.id_usuario}">
            <td>#${u.id_usuario}</td>
            <td>${[u.nombre, u.primer_apellido, u.segundo_apellido].filter(Boolean).join(' ') || '—'}</td>
            <td>${u.correo || '—'}</td>
            <td>${u.negocio || '—'}</td>
            <td>${Number(u.id_rol_usuario) === 2 ? 'Admin' : 'Cliente'}</td>
            <td>${fmtDate(u.fecha_registro)}</td>
            <td style="text-align:right;">
              <div class="ad-row-actions">
                <button class="ad-btn ghost" data-edit>Editar</button>
              </div>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

        cont.querySelectorAll('[data-edit]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.closest('tr')?.dataset.id;
                if (!id) return;

                try {
                    const r = await apiFetchPublic(`/api/admin/users/${id}`, { method: 'GET', auth: true });
                    if (!r.ok) throw new Error(`HTTP ${r.status}`);
                    const u = r.data || {};

                    $('#formUser [name="id_usuario"]').value = u.id_usuario || id;
                    $('#formUser [name="nombre"]').value = u.nombre || '';
                    $('#formUser [name="primer_apellido"]').value = u.primer_apellido || '';
                    $('#formUser [name="segundo_apellido"]').value = u.segundo_apellido || '';
                    $('#formUser [name="correo"]').value = (u.correo || '');
                    $('#formUser [name="negocio"]').value = u.negocio || '';

                    const dlg = $('#dlgUser');
                    try { dlg.showModal(); } catch { dlg.setAttribute('open', ''); }
                } catch (e) {
                    toast('No se pudo cargar el usuario', false);
                }
            });
        });
    }

    async function loadUsers(page = usrPage) {
        usrPage = page;

        const f = Object.fromEntries(new FormData(usrFilters || document.createElement('form')));
        const q = new URLSearchParams();

        // ✅ backend espera "correo" (no "q")
        if (f.q) q.set('correo', f.q.trim());

        // ✅ si decidiste NO filtrar por rol, podés borrar esto y quitar el select en HTML
        if (f.rol) q.set('rol', f.rol);

        q.set('page', page);
        q.set('pageSize', usrPageSize);

        try {
            const r = await apiFetchPublic(`/api/admin/users?${q.toString()}`, { method: 'GET', auth: true });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);

            // ✅ backend devuelve { data: [...], total, page, pageSize }
            const items = r.data?.data || [];
            usrTotal = Number(r.data?.total ?? items.length);

            renderUsersTable(items);
            renderPager('#usersPager', page, usrTotal, usrPageSize, loadUsers);
        } catch (e) {
            $('#usersTable').innerHTML = `<div class="ad-card">No se pudieron listar usuarios.</div>`;
            $('#usersPager').innerHTML = '';
        }
    }

    // Guardar usuario (PUT /api/admin/users/{id})
    $('#formUser')?.addEventListener('submit', async (e) => {
        const btn = e.submitter?.value;
        if (btn !== 'ok') return;
        e.preventDefault();

        const id = $('#formUser [name="id_usuario"]').value;

        const body = {
            nombre: $('#formUser [name="nombre"]').value.trim(),
            primer_apellido: $('#formUser [name="primer_apellido"]').value.trim(),
            segundo_apellido: $('#formUser [name="segundo_apellido"]').value.trim(),
            correo: $('#formUser [name="correo"]').value.trim().toLowerCase(),
            negocio: $('#formUser [name="negocio"]').value.trim()
        };

        try {
            const r = await apiFetchPublic(`/api/admin/users/${id}`, { method: 'PUT', body, auth: true });
            if (!r.ok) throw new Error(r.data?.error || `HTTP ${r.status}`);

            toast('Usuario actualizado');
            $('#dlgUser').close();
            loadUsers();
        } catch (err) {
            toast(err.message || 'No se pudo actualizar', false);
        }
    });

    function ensureAdminDetailDialog() {
        let dlg = document.querySelector('#dlgAdminOrderDetail');
        if (dlg) return dlg;

        dlg = document.createElement('dialog');
        dlg.id = 'dlgAdminOrderDetail';
        dlg.className = 'ad-dialog'; // usa tu estilo de dialog
        dlg.innerHTML = `
    <form method="dialog" class="ad-form" style="max-width:980px;">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;">
        <h3 style="margin:0;">Detalle del pedido</h3>
        <button class="ad-btn" value="cancel">Cerrar</button>
      </div>
      <div id="aodBody" style="margin-top:10px;">Cargando…</div>
    </form>
  `;
        document.body.appendChild(dlg);
        return dlg;
    }

    // Modal chip: reutilizamos el chipEstado del admin (ya lo tenés arriba)
    function adminStatusChip(name) {
        // si ya existe chipEstado, úsalo
        if (typeof chipEstado === 'function') return chipEstado(name);
        // fallback mínimo
        return `<span class="ad-chip">${name || '—'}</span>`;
    }

    // =======================
    // Abrir orden desde admin
    // =======================

    async function openAdminOrderDetail(id) {
        const dlg = ensureAdminDetailDialog();
        $('#aodBody', dlg).innerHTML = `Cargando…`;
        try { dlg.showModal(); } catch { dlg.setAttribute('open', ''); }

        const det = await apiFetchPublic(`/api/admin/orders/${id}`, { method: 'GET', auth: true });
        if (!det.ok) {
            $('#aodBody', dlg).innerHTML = `No se pudo obtener el detalle (HTTP ${det.status})`;
            return;
        }

        const o = det.data;

        const tot = o.totales || {};
        const peso = o.pesos || {};
        const esEst = o.flags?.tiene_peso_variable && (tot.subtotal_final == null);

        const entregaTxt = o.entrega?.nombre || '—';
        const pagoTxt = o.pago?.nombre || '—';

        const address = o.direccion?.id ? `
    <div style="margin-top:6px;color:var(--muted);font-size:13px;">
      ${[o.direccion?.provincia, o.direccion?.canton, o.direccion?.distrito].filter(Boolean).join(', ')} · ${o.direccion?.direccion_exacta || ''}
    </div>` : '';

        // Tabla items con inputs para peso real en rollos
        const itemsHTML = (o.items || []).map(it => {
            const dims = it.dimensiones ? `${it.dimensiones.ancho}×${it.dimensiones.alto}` : '';
            const qty = Number(it.cantidad ?? 0);

            const precioTxt = (it.precio_unitario != null)
                ? fmtCRC(it.precio_unitario)
                : (it.es_peso_variable ? '—' : '');

            const subtotalTxt = (it.subtotal != null) ? fmtCRC(it.subtotal) : '—';

            // Input de peso: solo si es_peso_variable
            const pesoInput = it.es_peso_variable ? `
      <div style="display:flex;gap:8px;justify-content:flex-end;align-items:center;">
        <input
          type="number"
          min="0"
          step="0.001"
          inputmode="decimal"
          class="ad-input"
          style="width:140px;"
          placeholder="kg"
          data-weight-input
          data-id-bolsa="${it.id_bolsa}"
          value="${it.peso_real_total_kg != null ? it.peso_real_total_kg : ''}"
        />
        <button class="ad-btn primary" type="button" data-save-weight data-id-bolsa="${it.id_bolsa}">
          Guardar
        </button>
      </div>
      <div style="color:var(--muted);font-size:12px;text-align:right;margin-top:4px;">
        Máx: ${it.peso_max_total_kg ?? '—'} kg · ₡/kg: ${it.precio_por_kg_aplicado != null ? fmtCRC(it.precio_por_kg_aplicado) : '—'}
      </div>
    ` : '';

            return `
      <tr>
        <td>${it.descripcion_bolsa || 'Producto'}</td>
        <td>${dims}</td>
        <td style="text-align:right;">${qty}</td>
        <td style="text-align:right;">${precioTxt}</td>
        <td style="text-align:right;">${subtotalTxt}</td>
      </tr>
      ${it.es_peso_variable ? `
        <tr>
          <td colspan="5" style="padding:10px 4px;border-bottom:1px solid var(--border);">
            ${pesoInput}
          </td>
        </tr>` : ''}
    `;
        }).join('');

        $('#aodBody', dlg).innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
      <div>
        <div style="font-weight:800;">Pedido #${o.id_orden}</div>
        <div style="color:var(--muted);font-size:13px;">${fmtDate(o.fecha)}</div>

        <div style="margin-top:6px;display:flex;gap:8px;flex-wrap:wrap;">
          ${adminStatusChip(o?.estado?.nombre)}
          <span class="ad-btn ghost" style="border-radius:999px;padding:6px 10px;font-size:12px;">${entregaTxt}</span>
          <span class="ad-btn ghost" style="border-radius:999px;padding:6px 10px;font-size:12px;">${pagoTxt}</span>
          <span class="ad-btn ghost" style="border-radius:999px;padding:6px 10px;font-size:12px;">${o.cliente?.correo || '—'}</span>
        </div>
        ${address}
      </div>

      <div style="text-align:right;">
        <div style="font-weight:900;font-size:18px;">${fmtCRC(o?.totales?.gran_total)}</div>
        ${esEst ? `<div style="color:#8e44ad;font-size:12px;margin-top:4px;">Total estimado (orden con rollos)</div>` : ''}
      </div>
    </div>

    <hr class="pf-sep" style="margin:14px 0;">

    <div class="pf-sheet" style="box-shadow:none;padding:16px;">
      <h4 style="margin:0 0 10px;">Artículos</h4>
      <div style="overflow:auto;">
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
      <div class="pf-card" style="padding:12px;">
        <h4 style="margin:0 0 8px;">Totales</h4>
        <div class="pf-card-list" style="gap:6px;">
          <div class="pf-line"><span>Subtotal (est. máx.)</span> <strong>${tot.subtotal_est_max != null ? fmtCRC(tot.subtotal_est_max) : '—'}</strong></div>
          <div class="pf-line"><span>Subtotal final</span> <strong>${tot.subtotal_final != null ? fmtCRC(tot.subtotal_final) : '—'}</strong></div>
          <div class="pf-line"><span>Descuento</span> <strong>− ${fmtCRC(tot.descuento_total || 0)}</strong></div>
          <div class="pf-line"><span>Envío</span> <strong>${fmtCRC(tot.envio_total || 0)}</strong></div>
          <div class="pf-line"><span>Impuestos</span> <strong>${fmtCRC(tot.impuesto_total || 0)}</strong></div>
          <hr class="pf-sep thin">
          <div class="pf-line" style="font-weight:900;"><span>Total</span> <strong>${fmtCRC(tot.gran_total || 0)}</strong></div>
        </div>
        ${(o.flags?.tiene_peso_variable || peso?.real_total_kg != null)
                ? `<div style="margin-top:10px;color:var(--muted);font-size:13px;">
               Peso máximo estimado: ${peso?.max_total_kg ?? '—'} kg ·
               Peso real: ${peso?.real_total_kg ?? '—'} kg
             </div>` : ''}
      </div>

      <div class="pf-card" style="padding:12px;">
        <h4 style="margin:0 0 8px;">Acciones</h4>
        <div style="color:var(--muted);font-size:13px;">
          Ingresá el peso real en los productos que requieren pesaje. Al guardar, se recalculan subtotales y total.
        </div>
      </div>
    </div>
  `;

        // Wire: guardar peso por item
        $('#aodBody', dlg).querySelectorAll('[data-save-weight]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const idBolsa = btn.dataset.idBolsa;
                const input = $('#aodBody', dlg).querySelector(`[data-weight-input][data-id-bolsa="${idBolsa}"]`);
                const val = Number(input?.value);

                if (!input || !Number.isFinite(val) || val <= 0) {
                    toast('Ingresa un peso válido (> 0)', false);
                    return;
                }

                btn.disabled = true;
                try {
                    const r = await apiFetchPublic(`/api/admin/orders/${id}/items/${idBolsa}/weight`, {
                        method: 'PATCH',
                        body: { peso_real_total_kg: val },
                        auth: true
                    });

                    if (!r.ok) throw new Error(r.data?.error || `HTTP ${r.status}`);
                    toast('Peso guardado');

                    // refrescar el modal para ver totales/subtotales nuevos
                    await openAdminOrderDetail(id);

                    // refrescar tabla principal por si cambia total/subtotales
                    loadOrders().catch(() => { });
                } catch (e) {
                    toast(e.message || 'No se pudo guardar el peso', false);
                } finally {
                    btn.disabled = false;
                }
            });
        });
    }



    // =======================
    // Pager genérico
    // =======================
    function renderPager(sel, page, total, pageSize, goFn) {
        const el = (typeof sel === 'string') ? $(sel) : sel;
        const totalPages = Math.max(1, Math.ceil(total / pageSize));
        el.innerHTML = `
      <div class="info">Mostrando página ${page} de ${totalPages} · ${total} registros</div>
      <button ${page <= 1 ? 'disabled' : ''} data-p="first">«</button>
      <button ${page <= 1 ? 'disabled' : ''} data-p="prev">‹</button>
      <button ${page >= totalPages ? 'disabled' : ''} data-p="next">›</button>
      <button ${page >= totalPages ? 'disabled' : ''} data-p="last">»</button>
    `;
        el.querySelectorAll('button').forEach(b => {
            b.addEventListener('click', () => {
                const act = b.dataset.p;
                let target = page;
                if (act === 'first') target = 1;
                if (act === 'prev') target = Math.max(1, page - 1);
                if (act === 'next') target = Math.min(totalPages, page + 1);
                if (act === 'last') target = totalPages;
                goFn(target);
            });
        });
    }

    // =======================
    // Init
    // =======================
    document.addEventListener('DOMContentLoaded', () => {
        // Tab inicial
        loadDashboard();
    });
})();
