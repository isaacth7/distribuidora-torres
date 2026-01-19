const express = require('express');
const { pool } = require('../config/db');
const auth = require('../middlewares/auth');

const validate = require('../middlewares/validate');
const { addItemValidator, setQtyValidator, idBolsaParam } = require('../validators/cartValidators');

const router = express.Router();

/* ========= Helpers ========= */

// Llama a tu propio endpoint de pricing dentro del backend
async function getPricingForBolsaHttp(id_bolsa) {
  const base = `http://localhost:${process.env.PORT || 3000}`;
  // Si usas Node 16, instala node-fetch y usa: const fetch = (await import('node-fetch')).default;
  const res = await fetch(`${base}/api/bolsas/${id_bolsa}/pricing`);
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  // el endpoint puede devolver {data: {...}} o {...}
  return data?.data ?? data ?? null;
}

// pricing → unitario aplicado (lo que guardamos en carrito)
function unitFromPricing(raw) {
  if (!raw) return { unit: 0, estrategia: null, snapshot: {} };

  const estrategia = raw.estrategia ?? raw.pricing_strategy ?? raw.strategy ?? null;
  const precio_por_unidad = Number(raw.precio_por_unidad ?? raw.unit_price ?? 0);
  const precio_por_kg = Number(raw.precio_por_kg ?? raw.price_per_kg ?? 0);
  const es_peso_variable = !!(raw.es_peso_variable ?? raw.peso_variable ?? raw.variable_weight);
  const peso_max_kg = Number(raw.peso_max_kg ?? raw.max_kg ?? 0);

  if (estrategia === 'por_unidad') {
    return { unit: precio_por_unidad, estrategia, snapshot: raw };
  }

  if (estrategia === 'por_kg') {
    if (es_peso_variable) {
      const tope = precio_por_kg * peso_max_kg;
      return { unit: Number(tope || 0), estrategia: 'por_kg_variable', snapshot: raw };
    }
    return { unit: precio_por_kg, estrategia, snapshot: raw };
  }

  if (estrategia === 'por_pack') {
    const packs = raw.packs ?? [];
    if (Array.isArray(packs) && packs.length) {
      // default: primer pack (o elegí 500 si existe)
      const chosen =
        packs.find(p => Number(p.pack_qty) === 500) ?? packs[0];

      const packPrice = Number(chosen.precio_por_pack ?? 0);
      const packQty = Number(chosen.pack_qty ?? 0);

      return {
        unit: packPrice,                 // precio del pack (esto es lo que guardás en carrito)
        estrategia: 'por_pack',
        snapshot: { ...raw, pack_seleccionado: { pack_qty: packQty, precio_por_pack: packPrice } }
      };
    }

    return { unit: 0, estrategia: 'por_pack', snapshot: raw };
  }

  return { unit: 0, estrategia: null, snapshot: raw };
}


// obtiene o crea carrito ACTIVO del usuario
async function getOrCreateCart(userId) {
  const rSel = await pool.query(
    `SELECT id_carrito FROM carritos
      WHERE id_usuario=$1 AND estado='ACTIVO'
      ORDER BY id_carrito DESC LIMIT 1`, [userId]
  );
  if (rSel.rows[0]) return rSel.rows[0].id_carrito;

  const rIns = await pool.query(
    `INSERT INTO carritos (id_usuario, estado)
     VALUES ($1,'ACTIVO') RETURNING id_carrito`, [userId]
  );
  return rIns.rows[0].id_carrito;
}

/* ========= GET /api/cart ========= */
router.get('/cart', auth, async (req, res) => {
  try {
    const uid = req.user.sub;
    const idCarrito = await getOrCreateCart(uid);

    const sql = `
      SELECT
        cp.id_bolsa, cp.cantidad, cp.precio_aplicado,
        b.descripcion_bolsa, b.ancho, b.alto,
        tb.nombre_bolsa AS tipo, st.nombre_subtipo_bolsa AS subtipo
      FROM carrito_productos cp
      JOIN bolsas b ON b.id_bolsa = cp.id_bolsa
      JOIN tipo_bolsa tb ON tb.id_tipo_bolsa = b.id_tipo_bolsa
      LEFT JOIN subtipos_bolsas st ON st.id_subtipo_bolsa = b.id_subtipo_bolsa
      WHERE cp.id_carrito = $1
      ORDER BY b.descripcion_bolsa ASC
    `;
    const r = await pool.query(sql, [idCarrito]);
    const rows = r.rows;

    // Autocuración: si hay filas con precio_aplicado=0, calcula y actualiza
    for (const row of rows) {
      if (!row.precio_aplicado || Number(row.precio_aplicado) === 0) {
        const pr = await getPricingForBolsaHttp(row.id_bolsa);
        const { unit, estrategia, snapshot } = unitFromPricing(pr);
        await pool.query(
          `UPDATE carrito_productos
             SET precio_aplicado=$1,
                 pricing_estrategia=$2,
                 pricing_snapshot=$3
           WHERE id_carrito=$4 AND id_bolsa=$5`,
          [unit, estrategia, JSON.stringify(snapshot || {}), idCarrito, row.id_bolsa]
        );
        row.precio_aplicado = unit;
      }
    }

    const items = rows.map(r => {
      const unit = Number(r.precio_aplicado || 0);
      const qty = Number(r.cantidad || 0);
      return {
        id_bolsa: r.id_bolsa,
        descripcion: r.descripcion_bolsa,
        tipo: r.tipo,
        subtipo: r.subtipo,
        dimensiones: { ancho: r.ancho, alto: r.alto },
        precio_unitario: unit,
        cantidad: qty,
        subtotal: Number((unit * qty).toFixed(2))
      };
    });

    const total = Number(items.reduce((acc, it) => acc + it.subtotal, 0).toFixed(2));
    res.json({ id_carrito: idCarrito, items, total });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'No se pudo obtener el carrito' });
  }
});

/* ========= POST /api/cart/items ========= */
router.post('/cart/items', auth, addItemValidator, validate, async (req, res) => {
  try {
    const uid = req.user.sub;
    const idCarrito = await getOrCreateCart(uid);
    const { id_bolsa, cantidad } = req.body;

    // pricing vigente → unitario aplicado
    const pr = await getPricingForBolsaHttp(id_bolsa);
    const { unit, estrategia, snapshot } = unitFromPricing(pr);

    const sql = `
      INSERT INTO carrito_productos (id_carrito, id_bolsa, cantidad, precio_aplicado, pricing_estrategia, pricing_snapshot)
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (id_carrito, id_bolsa)
      DO UPDATE SET
        cantidad           = carrito_productos.cantidad + EXCLUDED.cantidad,
        precio_aplicado    = EXCLUDED.precio_aplicado,
        pricing_estrategia = EXCLUDED.pricing_estrategia,
        pricing_snapshot   = EXCLUDED.pricing_snapshot
      RETURNING id_carrito, id_bolsa, cantidad, precio_aplicado
    `;
    const { rows } = await pool.query(sql, [
      idCarrito, id_bolsa, cantidad, unit, estrategia, JSON.stringify(snapshot || {})
    ]);

    res.status(201).json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'No se pudo agregar al carrito' });
  }
});

/* ========= PATCH /api/cart/items/:id_bolsa ========= */
router.patch('/cart/items/:id_bolsa', auth, setQtyValidator, validate, async (req, res) => {
  try {
    const uid = req.user.sub;
    const id_bolsa = parseInt(req.params.id_bolsa, 10);
    const { cantidad } = req.body;

    const idCarrito = await getOrCreateCart(uid);
    const q = `
      UPDATE carrito_productos
         SET cantidad=$1
       WHERE id_carrito=$2 AND id_bolsa=$3
   RETURNING id_carrito,id_bolsa,cantidad,precio_aplicado
    `;
    const { rows } = await pool.query(q, [cantidad, idCarrito, id_bolsa]);
    if (!rows[0]) return res.status(404).json({ error: 'Item no existe en el carrito' });

    // (Opcional) si quedó en 0, recalcula y corrige
    if (Number(rows[0].precio_aplicado || 0) === 0) {
      const pr = await getPricingForBolsaHttp(id_bolsa);
      const { unit, estrategia, snapshot } = unitFromPricing(pr);
      await pool.query(
        `UPDATE carrito_productos SET precio_aplicado=$1, pricing_estrategia=$2, pricing_snapshot=$3
          WHERE id_carrito=$4 AND id_bolsa=$5`,
        [unit, estrategia, JSON.stringify(snapshot || {}), idCarrito, id_bolsa]
      );
      rows[0].precio_aplicado = unit;
    }

    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'No se pudo actualizar el item' });
  }
});

/* ========= DELETE item ========= */
router.delete('/cart/items/:id_bolsa', auth, idBolsaParam, validate, async (req, res) => {
  try {
    const uid = req.user.sub;
    const id_bolsa = parseInt(req.params.id_bolsa, 10);
    const idCarrito = await getOrCreateCart(uid);
    await pool.query(`DELETE FROM carrito_productos WHERE id_carrito=$1 AND id_bolsa=$2`, [idCarrito, id_bolsa]);
    res.status(204).end();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'No se pudo eliminar el item' });
  }
});

/* ========= DELETE /api/cart (vaciar) ========= */
router.delete('/cart', auth, async (req, res) => {
  try {
    const uid = req.user.sub;
    const idCarrito = await getOrCreateCart(uid);
    await pool.query(`DELETE FROM carrito_productos WHERE id_carrito=$1`, [idCarrito]);
    res.status(204).end();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'No se pudo vaciar el carrito' });
  }
});

module.exports = router;
