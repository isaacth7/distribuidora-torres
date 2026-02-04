// routes/orders.js
const express = require('express');
const { pool } = require('../config/db');
const auth = require('../middlewares/auth');
const { isRole } = require('../middlewares/roles');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const ADMIN = 2;

const router = express.Router();
const isDev = process.env.NODE_ENV !== 'production';

/* Helpers */
const getUserId = (req) =>
  req?.user?.sub ?? req?.user?.id_usuario ?? req?.user?.id ?? null;

async function tableExists(table) {
  const { rows } = await pool.query(
    `SELECT 1 FROM information_schema.tables
      WHERE table_schema='public' AND table_name=$1 LIMIT 1`,
    [table]
  );
  return !!rows[0];
}
async function columnExists(table, column) {
  const { rows } = await pool.query(
    `SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=$1 AND column_name=$2 LIMIT 1`,
    [table, column]
  );
  return !!rows[0];
}

const n2 = v => Math.round((Number(v) || 0) * 100) / 100;
const pickNum = (obj, ...keys) => {
  for (const k of keys) {
    const v = obj?.[k];
    if (v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v))) {
      return Number(v);
    }
  }
  return null;
};

// Busca un estado por lista de alias (lowercase). Devuelve id_estado o null.
async function resolveEstadoId(...aliases) {
  const names = aliases.filter(Boolean).map(s => s.toLowerCase());
  if (!names.length) return null;
  const { rows } = await pool.query(
    `SELECT id_estado, LOWER(nombre) AS n
       FROM estados_orden
      WHERE LOWER(nombre) = ANY($1::text[])
      ORDER BY id_estado ASC
      LIMIT 1`,
    [names]
  );
  return rows[0]?.id_estado ?? null;
}

// Retorna un estado inicial según si hay peso variable
async function getEstadoInicial(anyVariable) {
  if (anyVariable) {
    // Para órdenes con rollos
    return (await resolveEstadoId('pendiente_pesaje'))
      ?? (await resolveEstadoId('borrador'))
      ?? null;
  } else {
    // Para órdenes SIN rollos
    return (await resolveEstadoId('pendiente_pago'))
      ?? (await resolveEstadoId('borrador'))
      ?? null;
  }
}

// Carrito activo (ACTIVO -> no CERRADO -> último)
async function getActiveCartId(userId) {
  if (!userId) return null;
  let q = await pool.query(
    `SELECT id_carrito FROM carritos
      WHERE id_usuario=$1 AND estado='ACTIVO'
      ORDER BY fecha DESC LIMIT 1`,
    [userId]
  );
  if (q.rows[0]) return q.rows[0].id_carrito;

  q = await pool.query(
    `SELECT id_carrito FROM carritos
      WHERE id_usuario=$1 AND (estado IS NULL OR estado <> 'CERRADO')
      ORDER BY fecha DESC LIMIT 1`,
    [userId]
  );
  if (q.rows[0]) return q.rows[0].id_carrito;

  q = await pool.query(
    `SELECT id_carrito FROM carritos
      WHERE id_usuario=$1 ORDER BY fecha DESC LIMIT 1`,
    [userId]
  );
  return q.rows[0]?.id_carrito ?? null;
}

const canonSlug = (nombre) => {
  const n = (nombre || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (n.includes('sinpe')) return 'sinpe';
  if (n.includes('tarjet')) return 'tarjeta';
  if (n.includes('efect')) return 'efectivo';
  if (n.includes('pend')) return 'pendiente';
  return n || 'efectivo';
};

/* ========== GET /api/orders ========== */
router.get('/orders', auth, async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'No autenticado' });

  try {
    const { rows } = await pool.query(
      `SELECT  o.id_orden,
               o.fecha,
               o.gran_total,
               eo.id_estado, eo.nombre AS estado,
               te.nombre AS tipo_entrega,
               mp.nombre AS metodo_pago
         FROM ordenes o
    LEFT JOIN estados_orden eo   ON eo.id_estado       = o.id_estado
    LEFT JOIN tipos_entrega te   ON te.id_tipo_entrega = o.tipo_entrega
    LEFT JOIN metodos_pago mp    ON mp.id_metodo_pago  = o.id_metodo_pago
        WHERE o.id_usuario = $1
     ORDER BY o.fecha DESC`,
      [userId]
    );
    const data = rows.map(r => ({
      id_orden: r.id_orden,
      fecha: r.fecha,
      gran_total: r.gran_total !== null ? Number(r.gran_total) : null,
      estado: { id: r.id_estado, nombre: r.estado },
      tipo_entrega: r.tipo_entrega,
      metodo_pago: r.metodo_pago,
    }));
    res.json(data);
  } catch (e) {
    console.error('[orders:list]', e);
    res.status(500).json({
      error: 'No se pudieron obtener las órdenes',
      ...(isDev && { detail: e.detail || e.message, code: e.code, where: 'orders:list' })
    });
  }
});

/* ========== GET /api/orders/:id ========== */
router.get('/orders/:id', auth, async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'No autenticado' });

  try {
    const id = Number(req.params.id);

    const rOrden = await pool.query(
      `SELECT  o.id_orden, o.fecha,
               o.id_estado, eo.nombre AS estado,
               o.id_direccion,
               d.direccion_exacta, d.distrito, d.canton, d.provincia, d.codigo_postal,
               o.tipo_entrega, te.nombre AS tipo_entrega_nombre,
               o.id_metodo_pago, mp.nombre AS metodo_pago_nombre,
               o.subtotal_est_max, o.subtotal_final,
               o.descuento_total, o.envio_total, o.impuesto_total, o.gran_total,
               o.tiene_peso_variable,
               o.peso_max_total_kg, o.peso_real_total_kg,
               o.codigo_descuento
         FROM ordenes o
    LEFT JOIN estados_orden eo ON eo.id_estado       = o.id_estado
    LEFT JOIN direcciones_usuario  d  ON d.id_direccion     = o.id_direccion
    LEFT JOIN tipos_entrega te ON te.id_tipo_entrega = o.tipo_entrega
    LEFT JOIN metodos_pago mp  ON mp.id_metodo_pago  = o.id_metodo_pago
        WHERE o.id_orden = $1 AND o.id_usuario = $2`,
      [id, userId]
    );
    const o = rOrden.rows[0];
    if (!o) return res.status(404).json({ error: 'Orden no encontrada' });

    // ✅ Incluye op.pack_qty para devolverlo al front
    const rItems = await pool.query(
      `SELECT  op.id_bolsa, op.cantidad, op.precio_unitario, op.pack_qty,
               (CASE WHEN op.es_peso_variable THEN op.subtotal_final ELSE op.cantidad * op.precio_unitario END) AS subtotal,
               b.descripcion_bolsa, b.ancho, b.alto
         FROM orden_productos op
         JOIN bolsas b ON b.id_bolsa = op.id_bolsa
        WHERE op.id_orden = $1`,
      [id]
    );

    const items = rItems.rows.map(r => ({
      id_bolsa: r.id_bolsa,
      descripcion_bolsa: r.descripcion_bolsa,
      dimensiones: { ancho: r.ancho, alto: r.alto },
      precio_unitario: r.precio_unitario !== null ? Number(r.precio_unitario) : null,
      cantidad: Number(r.cantidad),
      pack_qty: r.pack_qty !== null ? Number(r.pack_qty) : null, // ✅
      subtotal: r.subtotal !== null ? Number(r.subtotal) : null,
    }));

    res.json({
      id_orden: o.id_orden,
      fecha: o.fecha,
      estado: { id: o.id_estado, nombre: o.estado },
      totales: {
        subtotal_est_max: o.subtotal_est_max !== null ? Number(o.subtotal_est_max) : null,
        subtotal_final: o.subtotal_final !== null ? Number(o.subtotal_final) : null,
        descuento_total: Number(o.descuento_total || 0),
        envio_total: Number(o.envio_total || 0),
        impuesto_total: Number(o.impuesto_total || 0),
        gran_total: o.gran_total !== null ? Number(o.gran_total) : null,
      },
      flags: {
        tiene_peso_variable: !!o.tiene_peso_variable,
      },
      pesos: {
        max_total_kg: o.peso_max_total_kg !== null ? Number(o.peso_max_total_kg) : null,
        real_total_kg: o.peso_real_total_kg !== null ? Number(o.peso_real_total_kg) : null,
      },
      descuento: {
        codigo: o.codigo_descuento || null,
      },
      entrega: { id: o.tipo_entrega, nombre: o.tipo_entrega_nombre },
      pago: { id: o.id_metodo_pago, nombre: o.metodo_pago_nombre },
      direccion: {
        id: o.id_direccion,
        direccion_exacta: o.direccion_exacta,
        distrito: o.distrito,
        canton: o.canton,
        provincia: o.provincia,
        codigo_postal: o.codigo_postal,
      },
      items,
    });
  } catch (e) {
    console.error('[orders:detail]', e);
    res.status(500).json({
      error: 'No se pudo obtener el detalle de la orden',
      ...(isDev && { detail: e.detail || e.message, code: e.code, where: 'orders:detail' })
    });
  }
});

/* ========== POST /api/orders/checkout ========== */
router.post('/orders/checkout', auth, async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'No autenticado' });

  const { id_direccion, id_metodo_pago, id_tipo_entrega, codigo_descuento } = req.body;

  const fail = (status, message, err) => {
    const payload = { error: message, where: 'orders:checkout' };
    if (isDev && err) {
      payload.detail = err.detail || err.message;
      if (err.code) payload.code = err.code;
      if (err.table) payload.table = err.table;
      if (err.column) payload.column = err.column;
      if (err.constraint) payload.constraint = err.constraint;
      if (err.hint) payload.hint = err.hint;
    }
    return res.status(status).json(payload);
  };

  try {
    await pool.query('BEGIN');

    // Carrito activo
    const id_carrito = await getActiveCartId(userId);
    if (!id_carrito) {
      await pool.query('ROLLBACK');
      return fail(400, 'No hay carrito activo.');
    }

    // Ítems del carrito (bloqueados)
    const { rows: rawItems } = await pool.query(
      `SELECT cp.id_bolsa, cp.cantidad, cp.precio_aplicado, cp.pricing_snapshot,
              b.es_peso_variable
         FROM carrito_productos cp
         JOIN bolsas b ON b.id_bolsa = cp.id_bolsa
        WHERE cp.id_carrito = $1
        FOR UPDATE`,
      [id_carrito]
    );
    if (!rawItems.length) {
      await pool.query('ROLLBACK');
      return fail(400, 'El carrito está vacío.');
    }

    // —— Cálculos de ítems ——
    let anyVariable = false;
    let subtotalEst = 0;   // estimado de productos
    let subtotalFin = 0;   // final de productos (si todo es precio fijo)
    let pesoMaxTotal = 0;

    const items = rawItems.map(row => {
      const qty = Number(row.cantidad);
      const isVar = row.es_peso_variable === true || row.es_peso_variable === 1;
      anyVariable = anyVariable || isVar;

      let precio_unitario = null;
      let precio_por_kg_aplicado = null;
      let peso_max_total_kg = null;
      let sub_est = 0;
      let sub_fin = null;

      let snap = null;
      try {
        snap = typeof row.pricing_snapshot === 'string'
          ? JSON.parse(row.pricing_snapshot)
          : (row.pricing_snapshot || null);
      } catch { }

      // ✅ pack_qty viene de pricing_snapshot (opción 1)
      const pack_qty = pickNum(snap, 'pack_qty', 'packQuantity', 'qty_por_pack');

      if (isVar) {
        precio_por_kg_aplicado = pickNum(snap, 'precio_por_kg', 'price_per_kg', 'p_kg');
        if (!Number.isFinite(precio_por_kg_aplicado)) {
          precio_por_kg_aplicado = Number(row.precio_aplicado);
        }

        const pesoMaxPorRollo = pickNum(snap, 'peso_max_kg', 'peso_max', 'max_kg');

        if (Number.isFinite(pesoMaxPorRollo)) {
          peso_max_total_kg = n2(qty * pesoMaxPorRollo);
          pesoMaxTotal += peso_max_total_kg;
        }

        if (Number.isFinite(precio_por_kg_aplicado) && Number.isFinite(peso_max_total_kg)) {
          sub_est = n2(precio_por_kg_aplicado * peso_max_total_kg);
        } else {
          sub_est = 0;
        }

        sub_fin = null; // se llenará con peso real
      } else {
        precio_unitario = Number(row.precio_aplicado);
        sub_est = n2(precio_unitario * qty);
        sub_fin = sub_est;
      }

      subtotalEst += sub_est;
      subtotalFin += (sub_fin ?? 0);

      return {
        id_bolsa: row.id_bolsa,
        cantidad: qty,
        pack_qty: pack_qty !== null ? Number(pack_qty) : null, // ✅
        es_peso_variable: isVar,
        precio_unitario,
        precio_por_kg_aplicado,
        peso_max_total_kg,
        subtotal_estimado_max: sub_est,
        subtotal_final: sub_fin
      };
    });

    // Envío e impuestos (MVP)
    let envio_total = 0;
    if (await tableExists('tipos_entrega') && await columnExists('tipos_entrega', 'costo')) {
      const { rows } = await pool.query(
        `SELECT COALESCE(costo,0) AS costo
           FROM tipos_entrega
          WHERE id_tipo_entrega = $1
          LIMIT 1`,
        [id_tipo_entrega]
      );
      envio_total = Number(rows?.[0]?.costo ?? 0);
    }
    const impuesto_total = 0;

    // Descuento (MVP: solo guardar código; monto=0 por ahora)
    const descuento_total = 0;

    // Totales de orden
    const subtotal_est_max = n2(subtotalEst);
    const subtotal_final = anyVariable ? null : n2(subtotalFin);
    const tiene_peso_variable = anyVariable;

    const base = (subtotal_final ?? subtotal_est_max);
    const gran_total = n2(base - descuento_total + envio_total + impuesto_total);

    // Estado inicial según el tipo de orden
    const id_estado_inicial = await getEstadoInicial(anyVariable);
    if (!id_estado_inicial) {
      await pool.query('ROLLBACK');
      return fail(500, 'No hay estado inicial configurado en estados_orden (pendiente/por pesar).');
    }

    // INSERT orden
    const { rows: orderRows } = await pool.query(
      `INSERT INTO ordenes
         (id_usuario, tipo_entrega, id_direccion, id_metodo_pago, id_estado,
          subtotal_est_max, subtotal_final, descuento_total, envio_total, impuesto_total, gran_total,
          tiene_peso_variable, peso_max_total_kg, peso_real_total_kg,
          codigo_descuento, creado_por, actualizado_en, fecha)
       VALUES ($1,$2,$3,$4,$5,
               $6,$7,$8,$9,$10,$11,
               $12,$13,$14,
               $15,$16,NOW(),NOW())
       RETURNING id_orden`,
      [
        userId, id_tipo_entrega ?? null, id_direccion ?? null, id_metodo_pago ?? null, id_estado_inicial,
        subtotal_est_max, subtotal_final, descuento_total, envio_total, impuesto_total, gran_total,
        tiene_peso_variable, n2(pesoMaxTotal), null,
        (codigo_descuento || null), userId
      ]
    );
    const id_orden = orderRows[0].id_orden;

    // INSERT detalle (orden_productos)
    const values = items.flatMap(it => [
      id_orden,
      it.id_bolsa,
      it.cantidad,
      it.precio_unitario,
      it.es_peso_variable,
      it.precio_por_kg_aplicado,
      it.pack_qty,            // ✅ ya NO es null fijo
      it.peso_max_total_kg,
      null, // peso_real_total_kg
      it.subtotal_estimado_max,
      it.subtotal_final
    ]);

    const placeholders = items
      .map((_, i) => {
        const b = i * 11;
        return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11})`;
      })
      .join(',');

    await pool.query(
      `INSERT INTO orden_productos
         (id_orden, id_bolsa, cantidad, precio_unitario,
          es_peso_variable, precio_por_kg_aplicado, pack_qty,
          peso_max_total_kg, peso_real_total_kg,
          subtotal_estimado_max, subtotal_final)
       VALUES ${placeholders}`,
      values
    );

    // Limpiar carrito
    await pool.query(`DELETE FROM carrito_productos WHERE id_carrito = $1`, [id_carrito]);
    await pool.query(`UPDATE carritos SET estado='CERRADO' WHERE id_carrito = $1`, [id_carrito]);

    await pool.query('COMMIT');

    return res.status(201).json({
      id_orden,
      totales: {
        subtotal_est_max, subtotal_final,
        descuento_total, envio_total, impuesto_total,
        gran_total
      },
      tiene_peso_variable
    });
  } catch (e) {
    await pool.query('ROLLBACK');
    return res.status(500).json({
      error: 'No se pudo crear la orden',
      ...(isDev && { detail: e.detail || e.message, code: e.code, where: 'orders:checkout' })
    });
  }
});

/* ========== GET /api/orders/checkout/preview ========== */
router.get('/orders/checkout/preview', auth, async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'No autenticado' });

  try {
    // carrito activo
    const id_carrito = await getActiveCartId(userId);

    // Items del carrito
    let items = [];
    if (id_carrito) {
      const hasImgs = await tableExists('imagenes_subtipos');
      const imgJoin = hasImgs
        ? `LEFT JOIN LATERAL (
             SELECT i.url_imagen
               FROM imagenes_subtipos i
              WHERE i.id_subtipo_bolsa = b.id_subtipo_bolsa
              ORDER BY i.orden NULLS LAST, i.id_imagen ASC
              LIMIT 1
           ) img ON TRUE`
        : '';

      const imgSel = hasImgs ? 'img.url_imagen' : 'NULL';

      const r = await pool.query(
        `
    SELECT  cp.id_bolsa,
            cp.cantidad,
            cp.precio_aplicado AS precio_unitario,
            (cp.cantidad * cp.precio_aplicado) AS subtotal_item,
            b.descripcion_bolsa AS producto,
            b.ancho, b.alto,
            b.es_peso_variable,
            ${imgSel} AS imagen_url
      FROM carrito_productos cp
      JOIN bolsas b ON b.id_bolsa = cp.id_bolsa
      ${imgJoin}
     WHERE cp.id_carrito = $1
  ORDER BY cp.id_bolsa ASC
    `,
        [id_carrito]
      );
      items = r.rows;
    }

    // totales (preview rápido)
    let subtotal = 0;
    if (id_carrito) {
      const { rows: tot } = await pool.query(
        `SELECT COALESCE(SUM(cp.cantidad * cp.precio_aplicado),0)::numeric(12,2) AS subtotal
           FROM carrito_productos cp
          WHERE cp.id_carrito = $1`,
        [id_carrito]
      );
      subtotal = Number(tot[0].subtotal || 0);
    }
    const shipping = 0;
    const taxes = 0;
    const total = subtotal + shipping + taxes;

    // direcciones
    const dRes = await pool.query(
      `SELECT id_direccion, direccion_exacta, distrito, canton, provincia, codigo_postal
         FROM direcciones_usuario
        WHERE id_usuario = $1
     ORDER BY id_direccion DESC`,
      [userId]
    );
    const addresses = dRes.rows.map(d => {
      const zona = [d.provincia, d.canton, d.distrito].filter(Boolean).join(', ');
      const exacta = (d.direccion_exacta || '').trim();
      const label = [zona, exacta && `· ${exacta}`].filter(Boolean).join(' ');
      return {
        id_direccion: d.id_direccion,
        provincia: d.provincia,
        canton: d.canton,
        distrito: d.distrito,
        direccion_exacta: d.direccion_exacta,
        codigo_postal: d.codigo_postal,
        label: label || 'Dirección',
      };
    });

    // métodos de pago
    let payment_methods = [];
    if (await tableExists('metodos_pago')) {
      const pm = await pool.query(
        `SELECT id_metodo_pago, nombre, descripcion
           FROM metodos_pago
       ORDER BY id_metodo_pago ASC`
      );
      payment_methods = pm.rows.map(r => ({
        id_metodo_pago: r.id_metodo_pago,
        nombre: r.nombre,
        descripcion: r.descripcion || null,
        slug: canonSlug(r.nombre),
      }));
    }

    // tipos de entrega
    let delivery_types = [];
    if (await tableExists('tipos_entrega')) {
      const hasSlug = await columnExists('tipos_entrega', 'slug');
      const hasCosto = await columnExists('tipos_entrega', 'costo');
      const sql = `
        SELECT id_tipo_entrega,
               nombre,
               ${hasSlug ? 'slug' : "LOWER(translate(nombre,'ÁÉÍÓÚáéíóú ','AEIOUaeiou')) AS slug"},
               ${hasCosto ? 'COALESCE(costo,0) AS costo' : '0::numeric AS costo'}
          FROM tipos_entrega
         ORDER BY id_tipo_entrega ASC`;
      const dt = await pool.query(sql);
      delivery_types = dt.rows;
    } else {
      delivery_types = [
        { id_tipo_entrega: 1, nombre: 'Retiro en tienda', slug: 'retiro', costo: 0 },
        { id_tipo_entrega: 2, nombre: 'Envío estándar', slug: 'envio', costo: 2500 },
        { id_tipo_entrega: 3, nombre: 'Entrega en ruta', slug: 'ruta', costo: 0 },
      ];
    }

    res.json({
      items,
      totals: { subtotal, shipping, taxes, total },
      addresses,
      payment_methods,
      delivery_types,
    });
  } catch (e) {
    console.error('[orders:preview]', e);
    res.status(500).json({
      error: 'No se pudo cargar el checkout (preview)',
      ...(isDev && { detail: e.detail || e.message, code: e.code, where: 'orders:preview' }),
    });
  }
});

// === Config upload (local)
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ts = Date.now();
    const base = (file.originalname || 'archivo').replace(/\s+/g, '_');
    cb(null, `${ts}__${base}`);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    const ok = /^(image\/(png|jpe?g|webp|gif)|application\/pdf)$/.test(file.mimetype);
    if (!ok) return cb(new Error('Tipo de archivo no permitido (solo imágenes o PDF).'));
    cb(null, true);
  }
});

// Helper para URL pública del archivo
function publicFileURL(filename, req) {
  const base = `${req.protocol}://${req.get('host')}`;
  return `${base}/uploads/${encodeURIComponent(filename)}`;
}

/* ========== POST /api/orders/:id/comprobantes (cliente sube) ========== */
router.post('/orders/:id/comprobantes', auth, upload.single('archivo'), async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'No autenticado' });

  try {
    const id_orden = Number(req.params.id);
    if (!Number.isFinite(id_orden)) return res.status(400).json({ error: 'ID de orden inválido' });
    if (!req.file) return res.status(400).json({ error: 'Falta archivo (campo: archivo)' });

    // Validar que la orden es del usuario
    const { rows: ordRows } = await pool.query(
      `SELECT id_usuario FROM ordenes WHERE id_orden=$1 LIMIT 1`, [id_orden]
    );
    const ord = ordRows[0];
    if (!ord) return res.status(404).json({ error: 'Orden no encontrada' });
    if (ord.id_usuario !== userId) return res.status(403).json({ error: 'No autorizado para esta orden' });

    // Insert en DB
    const url = publicFileURL(req.file.filename, req);
    const tipo_mime = req.file.mimetype;
    const nombre_archivo = req.file.originalname;
    const tamano_bytes = req.file.size;

    const { rows } = await pool.query(
      `INSERT INTO ordenes_comprobantes
         (id_orden, url_archivo, tipo_mime, nombre_archivo, tamano_bytes, estado, subido_por)
       VALUES ($1,$2,$3,$4,$5,'pendiente',$6)
       RETURNING id_comprobante, id_orden, url_archivo, tipo_mime, nombre_archivo, tamano_bytes, estado, subido_en`,
      [id_orden, url, tipo_mime, nombre_archivo, tamano_bytes, userId]
    );

    // (Opcional) bandera en ordenes
    await pool.query(`UPDATE ordenes SET tiene_comprobante = TRUE WHERE id_orden=$1`, [id_orden]);

    res.status(201).json(rows[0]);
  } catch (e) {
    console.error('[orders:upload-comprobante]', e);
    res.status(500).json({ error: 'No se pudo subir el comprobante', ...(isDev && { detail: e.message }) });
  }
});

/* ========== GET /api/orders/:id/comprobantes (cliente lista) ========== */
router.get('/orders/:id/comprobantes', auth, async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'No autenticado' });

  try {
    const id_orden = Number(req.params.id);
    if (!Number.isFinite(id_orden)) return res.status(400).json({ error: 'ID de orden inválido' });

    // Validar pertenencia
    const { rows: ordRows } = await pool.query(
      `SELECT id_usuario FROM ordenes WHERE id_orden=$1 LIMIT 1`, [id_orden]
    );
    const ord = ordRows[0];
    if (!ord) return res.status(404).json({ error: 'Orden no encontrada' });
    if (ord.id_usuario !== userId) return res.status(403).json({ error: 'No autorizado para esta orden' });

    const { rows } = await pool.query(
      `SELECT id_comprobante, id_orden, url_archivo, tipo_mime, nombre_archivo, tamano_bytes,
              estado, notas, subido_por, subido_en, validado_por, validado_en
         FROM ordenes_comprobantes
        WHERE id_orden=$1
        ORDER BY subido_en DESC`,
      [id_orden]
    );
    res.json(rows);
  } catch (e) {
    console.error('[orders:list-comprobantes]', e);
    res.status(500).json({ error: 'No se pudieron listar comprobantes', ...(isDev && { detail: e.message }) });
  }
});

/* ========== PATCH /api/orders/comprobantes/:id (admin aprueba/rechaza) ========== */
router.patch('/orders/comprobantes/:id', auth, isRole(ADMIN), async (req, res) => {
  const userId = getUserId(req);
  if (!userId) return res.status(401).json({ error: 'No autenticado' });

  const { estado, notas } = req.body || {};
  const est = String(estado || '').toLowerCase();
  if (!['aprobado', 'rechazado'].includes(est)) {
    return res.status(400).json({ error: 'Estado inválido (use aprobado|rechazado)' });
  }

  try {
    const { rows: compRows } = await pool.query(
      `SELECT c.id_comprobante, c.id_orden, c.estado, o.id_metodo_pago
         FROM ordenes_comprobantes c
         JOIN ordenes o ON o.id_orden = c.id_orden
        WHERE c.id_comprobante=$1`,
      [Number(req.params.id)]
    );
    const c = compRows[0];
    if (!c) return res.status(404).json({ error: 'Comprobante no encontrado' });

    await pool.query(
      `UPDATE ordenes_comprobantes
          SET estado=$1, notas=$2, validado_por=$3, validado_en=NOW()
        WHERE id_comprobante=$4`,
      [est, notas || null, userId, c.id_comprobante]
    );

    if (est === 'aprobado') {
      const { rows: st } = await pool.query(
        `SELECT id_estado FROM estados_orden
          WHERE LOWER(slug)='pagado' OR LOWER(nombre)='pagado' LIMIT 1`
      );
      const id_estado_pagado = st[0]?.id_estado || null;

      await pool.query(
        `UPDATE ordenes
            SET pagado_en = COALESCE(pagado_en, NOW()),
                id_estado = COALESCE($2, id_estado)
          WHERE id_orden=$1`,
        [c.id_orden, id_estado_pagado]
      );
    }

    res.json({ ok: true });
  } catch (e) {
    console.error('[orders:patch-comprobante]', e);
    res.status(500).json({ error: 'No se pudo actualizar el comprobante' });
  }
});

module.exports = router;
