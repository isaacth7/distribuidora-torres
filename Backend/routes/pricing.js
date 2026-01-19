// routes/pricing.js
const router = require('express').Router();
const { pool } = require('../config/db');

// GET /api/bolsas/:id/pricing
router.get('/bolsas/:id/pricing', async (req, res) => {
  const id = Number(req.params.id);
  if (!id) return res.status(400).json({ error: 'id inválido' });

  try {
    // 1) Datos base de la bolsa
    const base = await pool.query(
      `SELECT id_bolsa, id_tipo_bolsa, id_subtipo_bolsa,
              COALESCE(es_peso_variable, false) AS es_peso_variable
       FROM bolsas WHERE id_bolsa = $1`,
      [id]
    );
    if (base.rowCount === 0) return res.status(404).json({ error: 'bolsa no encontrada' });
    const b = base.rows[0];

    // 2) Regla ganadora (SKU > Subtipo > Tipo), excluye packs
    const pr = await pool.query(
      `SELECT estrategia, moneda, precio_por_kg, precio_por_unidad, prioridad,
              id_bolsa, id_subtipo_bolsa, id_tipo_bolsa
         FROM pricing_regla
        WHERE (id_bolsa = $1 OR id_subtipo_bolsa = $2 OR id_tipo_bolsa = $3)
          AND (estrategia <> 'por_pack')
          AND (vigente_desde IS NULL OR vigente_desde <= CURRENT_DATE)
          AND (vigente_hasta IS NULL OR vigente_hasta >= CURRENT_DATE)
     ORDER BY CASE
                WHEN id_bolsa IS NOT NULL THEN 1
                WHEN id_subtipo_bolsa IS NOT NULL THEN 2
                ELSE 3
              END,
              prioridad ASC
        LIMIT 1`,
      [b.id_bolsa, b.id_subtipo_bolsa, b.id_tipo_bolsa]
    );
    const rule = pr.rows[0];

    // 3) por_kg / por_unidad
    if (rule?.estrategia === 'por_kg') {
      const payload = {
        estrategia: 'por_kg',
        moneda: rule.moneda,
        precio_por_kg: Number(rule.precio_por_kg),
        es_peso_variable: !!b.es_peso_variable
      };
      if (b.es_peso_variable) {
        const bf = await pool.query(
          'SELECT peso_max_kg FROM bolsa_fisica WHERE id_bolsa = $1',
          [id]
        );
        if (bf.rowCount) payload.peso_max_kg = Number(bf.rows[0].peso_max_kg);
      }
      return res.json(payload);
    }

    if (rule?.estrategia === 'por_unidad') {
      return res.json({
        estrategia: 'por_unidad',
        moneda: rule.moneda,
        precio_por_unidad: Number(rule.precio_por_unidad)
      });
    }

    // 4) Packs (por SKU)
    const packs = await pool.query(
      `SELECT pack_qty, precio_por_pack, moneda,
          id_bolsa, id_subtipo_bolsa, id_tipo_bolsa
     FROM pricing_regla
    WHERE estrategia='por_pack'
      AND (id_bolsa=$1 OR id_subtipo_bolsa=$2 OR id_tipo_bolsa=$3)
      AND (vigente_desde IS NULL OR vigente_desde <= CURRENT_DATE)
      AND (vigente_hasta IS NULL OR vigente_hasta >= CURRENT_DATE)
 ORDER BY CASE
            WHEN id_bolsa IS NOT NULL THEN 1
            WHEN id_subtipo_bolsa IS NOT NULL THEN 2
            ELSE 3
          END,
          pack_qty ASC`,
      [b.id_bolsa, b.id_subtipo_bolsa, b.id_tipo_bolsa]
    );

    if (packs.rowCount) {
      return res.json({
        estrategia: 'por_pack',
        moneda: packs.rows[0].moneda,
        packs: packs.rows.map(r => ({
          pack_qty: Number(r.pack_qty),
          precio_por_pack: Number(r.precio_por_pack)
        }))
      });
    }

    return res.status(404).json({ error: 'sin regla de precio' });
  } catch (err) {
    console.error('pricing error', err);
    res.status(500).json({ error: 'error interno' });
  }
});

module.exports = router;
