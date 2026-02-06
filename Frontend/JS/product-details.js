// ===== Producto: Tipo -> Subtipo -> Tamaño =====

// ---------- Utils ----------
const apiAuth = window.apiFetch;        // helper con Authorization
const API_BASE = window.DT_API_BASE;     // 'http://localhost:3000'

const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const pickArray = (p) =>
  Array.isArray(p) ? p :
    Array.isArray(p?.items) ? p.items :
      Array.isArray(p?.data) ? p.data : [];

const fmtCRC = n => `₡ ${Number(n || 0).toLocaleString('es-CR')}`;

function findValDeep(obj, regex, depth = 2) {
  if (!obj || typeof obj !== 'object' || depth < 0) return null;
  for (const [k, v] of Object.entries(obj)) {
    if (regex.test(k)) return v;
    if (v && typeof v === 'object') {
      const found = findValDeep(v, regex, depth - 1);
      if (found != null) return found;
    }
  }
  return null;
}
function parseWHFromText(txt) {
  if (typeof txt !== 'string') return null;
  const m = txt.replace(',', '.').match(/(\d+(?:\.\d+)?)\s*[^0-9]\s*(\d+(?:\.\d+)?)/);
  return m ? [Number(m[1]), Number(m[2])] : null;
}
const getTipoId = (b) => Number(findValDeep(b, /^(id_)?tipo(_bolsa)?$/i));
const getSubId = (b) => Number(findValDeep(b, /^(id_)?subtipo(_bolsa)?$/i));
const getAncho = (b) => findValDeep(b, /^ancho(_(bolsa|pulgadas|in|cm))?$|^width$/i);
const getAlto = (b) => findValDeep(b, /^alto(_(bolsa|pulgadas|in|cm))?$|^height$/i);
const getPriceLegacy = (b) => {
  const v = findValDeep(b, /^precio(_(unitario|kilo))?$|^price$/i);
  return v == null || v === '' ? 0 : Number(v);
};
function sizeText(b) {
  let w = getAncho(b); let h = getAlto(b);
  if (w == null || h == null) {
    const combined = findValDeep(b, /^(tama(ñ|n)o|medida(s)?|dimension(es)?)$/i);
    const parsed = parseWHFromText(combined);
    if (parsed) [w, h] = parsed;
  }
  if (w != null && h != null) {
    const W = isNaN(Number(w)) ? w : Number(w);
    const H = isNaN(Number(h)) ? h : Number(h);
    return `${W}" × ${H}"`;
  }
  return findValDeep(b, /descripcion(_bolsa)?|desc/i) || 'Tamaño';
}

// ID robusto de bolsa/variante
function getBolsaId(v) {
  if (!v || typeof v !== 'object') return NaN;
  const cand = v.id_bolsa ?? v.bolsa_id ?? v.id ?? v.ID ?? v.Id ?? v.idBolsa ?? null;
  return cand == null || cand === '' ? NaN : Number(cand);
}

// ---------- UI refs ----------
const el = {
  title: $('.pd-title'),
  price: $('#lblPrice'),
  selSub: $('#selSubtipo'),
  selTam: $('#selTam'),
  qtyIn: $('#pdQtyInput'),
  qtyOut: document.querySelector('.pd-stepper-value')?.tagName === 'OUTPUT'
    ? document.querySelector('.pd-stepper-value')
    : null,
  packRow: $('#packRow'),
  subTot: $('.pd-subtotal'),
  minus: document.querySelector('.pd-stepper-btn[aria-label="Restar"]'),
  plus: document.querySelector('.pd-stepper-btn[aria-label="Sumar"]'),
  desc: $('.pd-desc'),
  addBtn: $('.pd-add-btn'),
  imgs: $$('.pd-col-left .pd-photo img'),

  note: $('#pdNote'),
  selPack: $('#selPack'),
  lblPack: $('#lblPack'),
  priceLabel: $('#priceLabel'),
  qtyLabel: $('#qtyLabel'),

  // ✅ NUEVO: loader + content wrapper (deben existir en el HTML)
  loading: document.getElementById('pdLoading'),
  content: document.getElementById('pdContent'),
};

const show = x => x && (x.style.display = '');
const hide = x => x && (x.style.display = 'none');

// ✅ NUEVO: controla loader + evita flash de contenido de prueba
function pdSetLoading(isLoading, msg = null) {
  const wrap = document.querySelector('.pd-wrapper');
  const loading = document.getElementById('pdLoading');
  const content = document.getElementById('pdContent');

  if (wrap) wrap.setAttribute('aria-busy', isLoading ? 'true' : 'false');

  document.body.classList.toggle('pd-lock-scroll', isLoading);

  if (loading) {
    loading.hidden = !isLoading;
    if (msg != null) {
      const p = loading.querySelector('.pd-loading-text');
      if (p) p.textContent = msg;
    }
  }

  if (content) content.hidden = isLoading;
}

// ---------- Estado ----------
const qs = new URLSearchParams(location.search);
const qTipo = qs.get('tipo');
const qSubtipo = qs.get('subtipo');

let tipos = [];
let subtipos = [];
let variantes = [];
let selectedSub = null;
let selectedBolsa = null;

let pricing = null;   // /api/bolsas/:id/pricing
let packQty = null;
let qty = 1;
let qtyStep = 1;

// ---------- API ----------
async function apiFetchPublic(path) {
  try {
    const res = await fetch(`${API_BASE}${path}`);
    const data = await res.json().catch(() => null);
    return { ok: res.ok, data };
  } catch (e) {
    console.error('fetch error', path, e);
    return { ok: false, data: null };
  }
}
async function loadTipos() {
  if (tipos.length) return tipos;
  const { ok, data } = await apiFetchPublic('/api/tipos-bolsas');
  tipos = ok ? pickArray(data) : [];
  return tipos;
}
async function loadSubtiposByTipo(idTipo) {
  const { ok, data } = await apiFetchPublic(`/api/tipos-bolsas/${idTipo}/subtipos`);
  subtipos = ok ? pickArray(data) : [];
  return subtipos;
}
async function loadVariantesBySubtipo(idSub) {
  const { ok, data } = await apiFetchPublic(`/api/bolsas?subtipo=${idSub}&pageSize=200`);
  variantes = ok ? pickArray(data) : [];
  return variantes;
}
async function loadImgsBySubtipo(idSub) {
  const { ok, data } = await apiFetchPublic(`/api/subtipos/${idSub}/imagenes?pageSize=6`);
  return ok ? pickArray(data).map(x => x.url_imagen).filter(Boolean) : [];
}
async function loadPricingForBolsa(idBolsa) {
  if (!idBolsa || isNaN(Number(idBolsa))) {
    console.warn('loadPricingForBolsa: id inválido', idBolsa, selectedBolsa);
    pricing = null;
    configureUIForPricing(); renderPrecioYSubtotal();
    return;
  }

  const { ok, data } = await apiFetchPublic(`/api/bolsas/${idBolsa}/pricing`);
  const raw = ok ? (data?.data ?? data ?? null) : null;
  console.log('pricing raw for', idBolsa, raw);

  if (!raw) {
    pricing = null;
    configureUIForPricing(); renderPrecioYSubtotal();
    return;
  }

  // normalización mínima
  const num = v => (v == null || v === '') ? null : Number(v);
  const bool = v => !!(v === true || v === 1 || v === '1' || v === 'true');

  const estrategia =
    raw.estrategia ?? raw.pricing_strategy ?? raw.strategy ?? null;

  pricing = {
    estrategia,
    precio_por_kg: num(raw.precio_por_kg ?? raw.price_per_kg),
    precio_por_unidad: num(raw.precio_por_unidad ?? raw.unit_price),
    es_peso_variable: bool(raw.es_peso_variable ?? raw.peso_variable ?? raw.variable_weight),
    peso_max_kg: num(raw.peso_max_kg ?? raw.max_kg),
    packs: Array.isArray(raw.packs) ? raw.packs.map(p => ({
      pack_qty: num(p.pack_qty ?? p.qty ?? p.cantidad) ?? 1,
      precio_por_pack: num(p.precio_por_pack ?? p.price ?? p.monto) ?? 0
    })) : (raw.precio_por_pack != null
      ? [{ pack_qty: 1, precio_por_pack: num(raw.precio_por_pack) }]
      : [])
  };

  console.log('pricing normalized', pricing);

  configureUIForPricing();
  renderPrecioYSubtotal();
}

// ---------- Render ----------
function setTitleTipo(idTipo) {
  const t = tipos.find(x => Number(x.id_tipo_bolsa) === Number(idTipo));
  if (el.title) el.title.textContent = t ? t.nombre_bolsa : 'Producto';
}
function renderSubtipos() {
  if (!el.selSub) return;
  el.selSub.innerHTML = subtipos.map(
    s => `<option value="${s.id_subtipo_bolsa}">${s.nombre_subtipo_bolsa}</option>`
  ).join('');
  if (selectedSub) el.selSub.value = String(selectedSub.id_subtipo_bolsa);
}
function renderTamanos() {
  if (!el.selTam) return;
  el.selTam.innerHTML = variantes.map(v => {
    const vid = getBolsaId(v);
    const sid = getBolsaId(selectedBolsa);
    return `
      <option value="${isNaN(vid) ? '' : vid}" ${vid === sid ? 'selected' : ''}>
        ${sizeText(v)}
      </option>
    `;
  }).join('');
}
function renderDesc() {
  if (!el.desc) return;
  const base = selectedSub?.nombre_subtipo_bolsa || 'Producto';
  el.desc.textContent = selectedSub?.descripcion_subtipo || `${base} ${sizeText(selectedBolsa)}`;
}

// ---------- Cantidad ----------
function applyQtyAttrs() {
  if (!el.qtyIn) return;
  if (pricing?.estrategia === 'por_kg' && !pricing.es_peso_variable) {
    el.qtyIn.step = '0.25';
    el.qtyIn.min = '0.25';
  } else {
    el.qtyIn.step = '1';
    el.qtyIn.min = '1';
  }
}
function updateQtyDisplay() {
  if (el.qtyIn) el.qtyIn.value = String(qty);
  if (el.qtyOut) {
    const txt = qtyStep < 1 ? qty.toFixed(2).replace(/\.00$/, '') : String(qty);
    el.qtyOut.textContent = txt;
  }
}
function setQty(n, silent = false) {
  const step = qtyStep || 1;
  const snapped = Math.max(step, Math.round(n / step) * step);
  qty = step < 1 ? Number(snapped.toFixed(2)) : snapped;
  updateQtyDisplay();
  if (!silent) renderPrecioYSubtotal();
}

// ---------- Config UI según pricing ----------
function configureUIForPricing() {
  if (el.note) el.note.textContent = '';
  hide(el.selPack); hide(el.lblPack); hide(el.packRow);

  if (!pricing) {
    el.priceLabel && (el.priceLabel.textContent = 'Precio:');
    el.qtyLabel && (el.qtyLabel.textContent = 'Cantidad:');
    qtyStep = 1; setQty(1, true); applyQtyAttrs();
    if (el.price) el.price.textContent = fmtCRC(getPriceLegacy(selectedBolsa));
    return;
  }

  if (pricing.estrategia === 'por_kg') {
    el.priceLabel && (el.priceLabel.textContent = 'Precio por kilo:');

    if (pricing.es_peso_variable) {
      el.qtyLabel && (el.qtyLabel.textContent = 'Cantidad (rollos):');
      qtyStep = 1; setQty(Math.max(1, qty), true); applyQtyAttrs();
      el.price && (el.price.textContent = `${fmtCRC(pricing.precio_por_kg)} / kg`);
      if (pricing.peso_max_kg && el.note) {
        const tope = pricing.precio_por_kg * pricing.peso_max_kg;
        el.note.textContent = `Tope por rollo: ${fmtCRC(tope)} (hasta ${pricing.peso_max_kg} kg).`;
      }
    } else {
      el.qtyLabel && (el.qtyLabel.textContent = 'Cantidad (kilos):');
      qtyStep = 0.25; setQty(Math.max(qtyStep, qty), true); applyQtyAttrs();
      el.price && (el.price.textContent = `${fmtCRC(pricing.precio_por_kg)} / kg`);
    }
    return;
  }

  if (pricing.estrategia === 'por_pack') {
    el.priceLabel && (el.priceLabel.textContent = 'Precio por pack:');
    el.qtyLabel && (el.qtyLabel.textContent = 'Cantidad (packs):');
    qtyStep = 1; setQty(Math.max(1, qty), true); applyQtyAttrs();

    const opts = (pricing.packs || []).map(p =>
      `<option value="${p.pack_qty}">${p.pack_qty} u — ${fmtCRC(p.precio_por_pack)}</option>`
    ).join('') || '<option>Sin packs</option>';

    if (el.selPack) {
      el.selPack.innerHTML = opts;
      show(el.packRow); show(el.selPack); show(el.lblPack);
      packQty = Number(el.selPack.value || 0);
    }
    return;
  }

  if (pricing.estrategia === 'por_unidad') {
    el.priceLabel && (el.priceLabel.textContent = 'Precio por unidad:');
    el.qtyLabel && (el.qtyLabel.textContent = 'Cantidad (unidades):');
    qtyStep = 1; setQty(Math.max(1, qty), true); applyQtyAttrs();
    el.price && (el.price.textContent = fmtCRC(pricing.precio_por_unidad));
  }
}

// ---------- Precio + Subtotal ----------
function renderPrecioYSubtotal() {
  if (!el.subTot) return;

  if (!pricing) {
    const price = getPriceLegacy(selectedBolsa);
    el.price && (el.price.textContent = fmtCRC(price));
    el.subTot.textContent = fmtCRC(price * qty);
    return;
  }

  if (!pricing.estrategia) {
    console.warn('Sin estrategia en pricing:', pricing);
    el.subTot.textContent = fmtCRC(0);
    return;
  }

  const estr = pricing.estrategia;
  let unit = 0, subtotal = 0;

  if (estr === 'por_kg') {
    if (pricing.es_peso_variable) {
      const tope = (pricing.peso_max_kg ? pricing.precio_por_kg * pricing.peso_max_kg : 0) || 0;
      unit = tope;
      subtotal = unit * qty;
      el.price && (el.price.textContent = `${fmtCRC(pricing.precio_por_kg)} / kg`);
    } else {
      unit = pricing.precio_por_kg || 0;
      subtotal = unit * qty;
      el.price && (el.price.textContent = `${fmtCRC(unit)} / kg`);
    }
  }

  if (estr === 'por_pack') {
    const pk = (pricing.packs || []).find(p => Number(p.pack_qty) === Number(packQty)) || pricing.packs?.[0];
    unit = pk ? (pk.precio_por_pack || 0) : 0;
    subtotal = unit * qty;
    el.price && (el.price.textContent = fmtCRC(unit));
  }

  if (estr === 'por_unidad') {
    unit = pricing.precio_por_unidad || 0;
    subtotal = unit * qty;
    el.price && (el.price.textContent = fmtCRC(unit));
  }

  el.subTot.textContent = fmtCRC(subtotal);
}

// ---------- Cambios de selección ----------
async function onSubtipoChange(newId) {
  pdSetLoading(true, 'Cargando producto...');

  try {
    selectedSub = subtipos.find(s => Number(s.id_subtipo_bolsa) === Number(newId)) || null;

    await loadVariantesBySubtipo(newId);

    if (!variantes.length) {
      if (el.selTam) el.selTam.innerHTML = '<option>Sin tamaños</option>';
      renderDesc(); renderPrecioYSubtotal(); renderImgs([]);
      if (el.addBtn) el.addBtn.disabled = true;
      return;
    }

    selectedBolsa = variantes.find(v => !isNaN(getBolsaId(v))) || variantes[0];

    renderSubtipos();
    renderTamanos();
    renderDesc();

    const sbId = getBolsaId(selectedBolsa);
    await loadPricingForBolsa(sbId);

    const isKg = pricing?.estrategia === 'por_kg' && !pricing.es_peso_variable;
    setQty(isKg ? 0.25 : 1, true);
    applyQtyAttrs();
    renderPrecioYSubtotal();

    const imgs = await loadImgsBySubtipo(newId);
    renderImgs(imgs);

    if (el.addBtn) el.addBtn.disabled = false;

  } catch (e) {
    console.error('onSubtipoChange error', e);
    // ✅ muestra contenido aunque haya error para que no se quede pegado
    renderImgs([]);
    if (el.addBtn) el.addBtn.disabled = true;

    // opcional: mensaje visible en la página
    const note = document.getElementById('pdNote');
    if (note) note.textContent = 'No se pudo cargar el producto. Intenta de nuevo.';
  } finally {
    // ✅ SIEMPRE apagar loader
    pdSetLoading(false);
    if (el.selSub) el.selSub.disabled = false;
    if (el.selTam) el.selTam.disabled = false;
    if (el.selPack) el.selPack.disabled = false;
  }
}


function renderImgs(urls = []) {
  const gallery = document.getElementById('pdGallery');
  if (!gallery) return;

  const list = urls.length ? urls : ['../Images/placeholder.png'];

  // crea máximo 3 como tu layout original (cámbialo si querés más)
  const max = 3;
  gallery.innerHTML = '';

  for (let i = 0; i < Math.min(max, list.length); i++) {
    const fig = document.createElement('figure');
    fig.className = 'pd-photo' + (i === 0 ? '' : ' is-cover'); // 1ra no recorta

    const img = document.createElement('img');
    img.src = list[i];
    img.alt = selectedSub?.nombre_subtipo_bolsa || 'Producto';

    fig.appendChild(img);
    gallery.appendChild(fig);
  }
}

// ---------- Listeners ----------
if (el.selSub) el.selSub.addEventListener('change', e => onSubtipoChange(e.target.value));

if (el.selTam) el.selTam.addEventListener('change', async e => {
  const id = Number(e.target.value);
  selectedBolsa = variantes.find(v => getBolsaId(v) === id) || selectedBolsa;
  renderDesc();

  // opcional: loader solo si tu pricing tarda mucho; normalmente no hace falta
  // pdSetLoading(true, 'Actualizando...');
  const sbId = getBolsaId(selectedBolsa);
  await loadPricingForBolsa(sbId);

  const isKg = pricing?.estrategia === 'por_kg' && !pricing.es_peso_variable;
  setQty(isKg ? 0.25 : 1);
  applyQtyAttrs();
  renderPrecioYSubtotal();
  // pdSetLoading(false);
});

if (el.selPack) el.selPack.addEventListener('change', e => {
  packQty = Number(e.target.value);
  renderPrecioYSubtotal();
});

// stepper +/- y edición manual
if (el.minus) el.minus.addEventListener('click', () => setQty(qty - qtyStep));
if (el.plus) el.plus.addEventListener('click', () => setQty(qty + qtyStep));

if (el.qtyIn) {
  el.qtyIn.addEventListener('input', () => {
    const v = parseFloat(String(el.qtyIn.value).replace(',', '.'));
    if (!isNaN(v)) setQty(v);
  });
  el.qtyIn.addEventListener('blur', () => {
    const v = parseFloat(String(el.qtyIn.value).replace(',', '.'));
    if (!isNaN(v)) setQty(v); else updateQtyDisplay();
  });
}

// ---------- Boot ----------
(async function init() {
  // ✅ Arranca ocultando el contenido para evitar flash de datos de prueba
  pdSetLoading(true, 'Cargando producto...');

  await loadTipos();

  try {
    if (qTipo) {
      setTitleTipo(qTipo);
      await loadSubtiposByTipo(qTipo);

      if (!subtipos.length) {
        if (el.selSub) el.selSub.innerHTML = '<option>Sin subtipos</option>';
        pdSetLoading(true, 'No hay subtipos disponibles');
        return;
      }

      selectedSub = subtipos.find(s => String(s.id_subtipo_bolsa) === String(qSubtipo)) || subtipos[0];
      renderSubtipos();

      await onSubtipoChange(selectedSub.id_subtipo_bolsa);
      return;
    }

    if (qSubtipo) {
      await loadVariantesBySubtipo(qSubtipo);

      if (!variantes.length) {
        if (el.selSub) el.selSub.innerHTML = '<option>Sin subtipos</option>';
        pdSetLoading(true, 'No hay variantes disponibles');
        return;
      }

      selectedBolsa = variantes.find(v => !isNaN(getBolsaId(v))) || variantes[0];
      const tipoId = getTipoId(selectedBolsa);
      setTitleTipo(tipoId);

      await loadSubtiposByTipo(tipoId);
      selectedSub = subtipos.find(s => Number(s.id_subtipo_bolsa) === Number(qSubtipo)) || subtipos[0];
      renderSubtipos();

      await onSubtipoChange(selectedSub.id_subtipo_bolsa);
      return;
    }

    // Sin parámetros (no hay qué cargar)
    if (el.title) el.title.textContent = 'Producto';
    if (el.selSub) el.selSub.innerHTML = '<option>Seleccione una categoría</option>';

    // ✅ en este caso, podés mostrar contenido vacío o mantener loader oculto.
    pdSetLoading(false);

  } catch (e) {
    console.error('init error', e);
    pdSetLoading(true, 'Error inicializando la página');
  }
})();

// === Add-to-cart ===

// === Cantidad según tu estrategia de pricing (negocio actual: unidades / kg / rollos) ===
function resolveCantidadParaBackend() {
  if (pricing?.estrategia === 'por_kg' && !pricing.es_peso_variable) return Number(qty);                     // kg
  if (pricing?.estrategia === 'por_kg' && pricing.es_peso_variable) return Math.max(1, Math.round(qty || 1)); // rollos
  return Math.max(1, Math.round(qty || 1)); // unidades
}

async function addCurrentToCart() {
  try {
    const id_bolsa = getBolsaId(selectedBolsa);
    if (!id_bolsa || isNaN(id_bolsa)) { throw new Error('No hay variante válida seleccionada.'); }

    const cantidad = resolveCantidadParaBackend();

    const { ok, status, data } = await apiAuth('/api/cart/items', {
      method: 'POST',
      body: { id_bolsa, cantidad },
      auth: true,
    });

    if (!ok) throw new Error(data?.error || `No se pudo agregar al carrito (HTTP ${status})`);

    await updateCartBadge();
    showToast('Artículo agregado a la bolsa', 'success');
    if (navigator.vibrate) navigator.vibrate(20);
  } catch (err) {
    showToast(err.message || 'No se pudo agregar al carrito', 'error');
  }
}

function bindCartButton() {
  // re-toma la referencia por si al inicio era null
  el.addBtn = document.querySelector('.pd-add-btn');
  el.addBtn?.addEventListener('click', addCurrentToCart);
}

// Si el DOM aún se está cargando, espera; si no, engancha ya.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bindCartButton);
} else {
  bindCartButton();
}

// Funcion que muestra el mensaje de exito o error al agregar al carrito
function showToast(message, type = 'success') {
  let t = document.getElementById('pdToast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'pdToast';
    t.setAttribute('role', 'status');
    t.setAttribute('aria-live', 'polite');
    document.body.appendChild(t);
  }
  t.className = ''; // reset
  t.classList.add(type, 'show');
  t.textContent = message;

  clearTimeout(window.__pdToastTimer);
  window.__pdToastTimer = setTimeout(() => t.classList.remove('show'), 2500);
}
