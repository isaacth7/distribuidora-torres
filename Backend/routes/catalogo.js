const express = require('express');
const { pool } = require('../config/db');
const router = express.Router();

/* =========================
   GET /api/tipos-bolsas
   Lista todos los tipos
   ========================= */
router.get('/tipos-bolsas', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id_tipo_bolsa, nombre_bolsa
       FROM tipo_bolsa
       ORDER BY nombre_bolsa ASC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudieron obtener los tipos de bolsa' });
  }
});

/* ==================================================================================
   GET /api/tipos-bolsas/:id/subtipos
   Lista subtipos de un tipo + sus imágenes (si existen), agrupadas por subtipo
   ================================================================================== */
router.get('/tipos-bolsas/:id/subtipos', async (req, res) => {
  try {
    const idTipo = parseInt(req.params.id, 10);
    if (Number.isNaN(idTipo)) return res.status(400).json({ error: 'id inválido' });

    const { rows } = await pool.query(
      `
      SELECT 
        st.id_subtipo_bolsa,
        st.nombre_subtipo_bolsa,
        st.descripcion_subtipo,
        COALESCE(
          JSON_AGG(
            JSON_BUILD_OBJECT(
              'id_imagen', img.id_imagen,
              'url_imagen', img.url_imagen,
              'descripcion', img.descripcion,
              'orden', img.orden
            )
            ORDER BY img.orden ASC
          ) FILTER (WHERE img.id_imagen IS NOT NULL),
          '[]'::json
        ) AS imagenes
      FROM subtipos_bolsas st
      LEFT JOIN imagenes_subtipos img ON img.id_subtipo_bolsa = st.id_subtipo_bolsa
      WHERE st.id_tipo_bolsa = $1
      GROUP BY st.id_subtipo_bolsa, st.nombre_subtipo_bolsa, st.descripcion_subtipo
      ORDER BY st.nombre_subtipo_bolsa ASC
      `,
      [idTipo]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudieron obtener los subtipos' });
  }
});

/* ===============================================================================================
   GET /api/bolsas
   Filtros (opcionales): ?tipo=ID &subtipo=ID &anchoMin=number &altoMin=number
   Paginación: ?page=1&pageSize=12
   Orden: ?sort=precio_asc | precio_desc | ancho_asc | ancho_desc | alto_asc | alto_desc
   =============================================================================================== */
router.get('/bolsas', async (req, res) => {
  try {
    const {
      tipo, subtipo, anchoMin, altoMin,
      page = 1, pageSize = 12, sort = 'precio_asc',
      meta = 'true' // si envías meta=false, oculto la metadata
    } = req.query;

    const pTipo = tipo ? parseInt(tipo, 10) : null;
    const pSubtipo = subtipo ? parseInt(subtipo, 10) : null;
    const pAnchoMin = anchoMin ? parseFloat(anchoMin) : null;
    const pAltoMin = altoMin ? parseFloat(altoMin) : null;
    const pPage = Math.max(parseInt(page, 10) || 1, 1);
    const pPageSize = Math.min(Math.max(parseInt(pageSize, 10) || 12, 1), 100);
    const offset = (pPage - 1) * pPageSize;

    const sortMap = {
      'precio_asc':  'b.precio ASC',
      'precio_desc': 'b.precio DESC',
      'ancho_asc':   'b.ancho ASC',
      'ancho_desc':  'b.ancho DESC',
      'alto_asc':    'b.alto ASC',
      'alto_desc':   'b.alto DESC'
    };
    const orderBy = sortMap[sort] || sortMap['precio_asc'];

    const where = [];
    const params = [];
    let i = 1;

    if (pTipo !== null)     { where.push(`b.id_tipo_bolsa = $${i++}`); params.push(pTipo); }
    if (pSubtipo !== null)  { where.push(`b.id_subtipo_bolsa = $${i++}`); params.push(pSubtipo); }
    if (pAnchoMin !== null) { where.push(`b.ancho >= $${i++}`); params.push(pAnchoMin); }
    if (pAltoMin !== null)  { where.push(`b.alto  >= $${i++}`); params.push(pAltoMin); }
    const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const sql = `
      SELECT
        b.id_bolsa,
        b.ancho, b.alto, b.precio, b.descripcion_bolsa,
        tb.id_tipo_bolsa, tb.nombre_bolsa AS tipo_nombre,
        st.id_subtipo_bolsa, st.nombre_subtipo_bolsa AS subtipo_nombre,
        COUNT(*) OVER() AS total
      FROM bolsas b
      JOIN tipo_bolsa tb ON tb.id_tipo_bolsa = b.id_tipo_bolsa
      LEFT JOIN subtipos_bolsas st ON st.id_subtipo_bolsa = b.id_subtipo_bolsa
      ${whereSql}
      ORDER BY ${orderBy}
      LIMIT $${i}::int OFFSET $${i+1}::int
    `;
    const values = [...params, pPageSize, offset];
    const { rows } = await pool.query(sql, values);

    const total = Number(rows[0]?.total || 0);

    // ✨ Formato “ordenado” por bolsa
    const items = rows.map(r => ({
      id: r.id_bolsa,
      tipo: {
        id: r.id_tipo_bolsa,
        nombre: r.tipo_nombre
      },
      subtipo: {
        id: r.id_subtipo_bolsa,
        nombre: r.subtipo_nombre
      },
      dimensiones: { ancho: r.ancho, alto: r.alto },
      precio: r.precio,
      descripcion: r.descripcion_bolsa
    }));

    // ¿Quieres metadata? meta=true (por defecto). Si no, devuelvo solo items.
    if (String(meta) === 'false') {
      return res.json(items);
    }

    res.json({
      total,
      page: pPage,
      pageSize: pPageSize,
      totalPages: Math.ceil(total / pPageSize),
      items
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudieron obtener las bolsas' });
  }
});




/* ========================================
   GET /api/bolsas/:id
   Detalle de bolsa + tipo/subtipo
   ======================================== */
router.get('/bolsas/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'id inválido' });

    const { rows } = await pool.query(
      `
      SELECT 
        b.id_bolsa,
        b.ancho,
        b.alto,
        b.precio,
        b.descripcion_bolsa,
        tb.id_tipo_bolsa,
        tb.nombre_bolsa AS tipo_nombre,
        st.id_subtipo_bolsa,
        st.nombre_subtipo_bolsa AS subtipo_nombre
      FROM bolsas b
      JOIN tipo_bolsa tb ON tb.id_tipo_bolsa = b.id_tipo_bolsa
      LEFT JOIN subtipos_bolsas st ON st.id_subtipo_bolsa = b.id_subtipo_bolsa
      WHERE b.id_bolsa = $1
      `,
      [id]
    );

    const item = rows[0];
    if (!item) return res.status(404).json({ error: 'Bolsa no encontrada' });

    res.json({
      id_bolsa: item.id_bolsa,
      ancho: item.ancho,
      alto: item.alto,
      precio: item.precio,
      descripcion_bolsa: item.descripcion_bolsa,
      tipo: { id: item.id_tipo_bolsa, nombre: item.tipo_nombre },
      subtipo: { id: item.id_subtipo_bolsa, nombre: item.subtipo_nombre }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'No se pudo obtener el detalle' });
  }
});

module.exports = router;
