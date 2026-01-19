const express = require('express');
const { pool } = require('../config/db');
const auth = require('../middlewares/auth');
const { isRole } = require('../middlewares/roles');
const validate = require('../middlewares/validate');
const { body, param, query } = require('express-validator');

const router = express.Router();
const ADMIN = 2;

/* ========== VALIDADORES REUTILIZABLES ========== */
const idParam = [ param('id').isInt({ min:1 }).withMessage('id inválido') ];
const paginacion = [
  query('page').optional().isInt({ min:1 }).withMessage('page inválido'),
  query('pageSize').optional().isInt({ min:1, max:100 }).withMessage('pageSize inválido'),
];

/* ========== TIPO_BOLSA ========== */
// LISTAR (con paginación opcional)
router.get('/admin/tipos-bolsas', auth, isRole(ADMIN), paginacion, validate, async (req,res)=>{
  try {
    const page = parseInt(req.query.page||'1',10);
    const pageSize = parseInt(req.query.pageSize||'50',10);
    const offset = (page-1)*pageSize;
    const sql = `
      WITH t AS (
        SELECT id_tipo_bolsa, nombre_bolsa FROM tipo_bolsa ORDER BY nombre_bolsa ASC
      )
      SELECT (SELECT COUNT(*) FROM t)::int AS total,
             COALESCE(JSON_AGG(t ORDER BY nombre_bolsa ASC) FILTER(WHERE t.id_tipo_bolsa IS NOT NULL), '[]') AS items
      FROM (SELECT * FROM t LIMIT $1 OFFSET $2) t;
    `;
    const { rows } = await pool.query(sql,[pageSize,offset]);
    res.json({ total: rows[0].total, page, pageSize, items: rows[0].items });
  } catch (e) { console.error(e); res.status(500).json({ error:'No se pudo listar' }); }
});

// CREAR
router.post('/admin/tipos-bolsas',
  auth, isRole(ADMIN),
  [ body('nombre_bolsa').exists().trim().isLength({min:2,max:100}).withMessage('nombre_bolsa requerido (2-100)') ],
  validate,
  async (req,res)=>{
    try {
      const { nombre_bolsa } = req.body;
      const { rows } = await pool.query(
        `INSERT INTO tipo_bolsa (nombre_bolsa) VALUES ($1) RETURNING id_tipo_bolsa, nombre_bolsa`,
        [nombre_bolsa]
      );
      res.status(201).json(rows[0]);
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error:'Tipo ya existe' });
      console.error(e); res.status(500).json({ error:'No se pudo crear' });
    }
  }
);

// ACTUALIZAR
router.put('/admin/tipos-bolsas/:id',
  auth, isRole(ADMIN),
  [ ...idParam, body('nombre_bolsa').exists().trim().isLength({min:2,max:100}).withMessage('nombre_bolsa requerido') ],
  validate,
  async (req,res)=>{
    try {
      const id = parseInt(req.params.id,10);
      const { nombre_bolsa } = req.body;
      const { rows } = await pool.query(
        `UPDATE tipo_bolsa SET nombre_bolsa=$1 WHERE id_tipo_bolsa=$2 RETURNING id_tipo_bolsa, nombre_bolsa`,
        [nombre_bolsa, id]
      );
      if (!rows[0]) return res.status(404).json({ error:'No encontrado' });
      res.json(rows[0]);
    } catch (e) { console.error(e); res.status(500).json({ error:'No se pudo actualizar' }); }
  }
);

// ELIMINAR (si no tiene subtipos/bolsas relacionadas)
router.delete('/admin/tipos-bolsas/:id',
  auth, isRole(ADMIN), idParam, validate,
  async (req,res)=>{
    try {
      const id = parseInt(req.params.id,10);
      // opcional: validar dependencias
      const dep = await pool.query(`SELECT 1 FROM subtipos_bolsas WHERE id_tipo_bolsa=$1 LIMIT 1`,[id]);
      if (dep.rowCount) return res.status(400).json({ error:'Tiene subtipos relacionados' });
      const r = await pool.query(`DELETE FROM tipo_bolsa WHERE id_tipo_bolsa=$1`,[id]);
      if (!r.rowCount) return res.status(404).json({ error:'No encontrado' });
      res.status(204).end();
    } catch (e) { console.error(e); res.status(500).json({ error:'No se pudo eliminar' }); }
  }
);

/* ========== SUBTIPOS_BOLSAS ========== */
// LISTAR por tipo
router.get('/admin/tipos-bolsas/:id/subtipos',
  auth, isRole(ADMIN), idParam, validate,
  async (req,res)=>{
    try {
      const idTipo = parseInt(req.params.id,10);
      const { rows } = await pool.query(
        `SELECT id_subtipo_bolsa, id_tipo_bolsa, nombre_subtipo_bolsa, descripcion_subtipo
         FROM subtipos_bolsas
         WHERE id_tipo_bolsa=$1
         ORDER BY nombre_subtipo_bolsa ASC`,
        [idTipo]
      );
      res.json(rows);
    } catch (e) { console.error(e); res.status(500).json({ error:'No se pudo listar' }); }
  }
);

// CREAR
router.post('/admin/subtipos-bolsas',
  auth, isRole(ADMIN),
  [
    body('id_tipo_bolsa').isInt({min:1}).withMessage('id_tipo_bolsa requerido'),
    body('nombre_subtipo_bolsa').exists().trim().isLength({min:2,max:100}).withMessage('nombre_subtipo_bolsa requerido'),
    body('descripcion_subtipo').optional({nullable:true}).trim().isLength({max:255}).withMessage('descripcion_subtipo muy larga')
  ],
  validate,
  async (req,res)=>{
    try {
      const { id_tipo_bolsa, nombre_subtipo_bolsa, descripcion_subtipo } = req.body;
      const { rows } = await pool.query(
        `INSERT INTO subtipos_bolsas (id_tipo_bolsa, nombre_subtipo_bolsa, descripcion_subtipo)
         VALUES ($1,$2,$3)
         RETURNING id_subtipo_bolsa, id_tipo_bolsa, nombre_subtipo_bolsa, descripcion_subtipo`,
        [id_tipo_bolsa, nombre_subtipo_bolsa, descripcion_subtipo ?? null]
      );
      res.status(201).json(rows[0]);
    } catch (e) { console.error(e); res.status(500).json({ error:'No se pudo crear' }); }
  }
);

// ACTUALIZAR
router.put('/admin/subtipos-bolsas/:id',
  auth, isRole(ADMIN),
  [
    ...idParam,
    body('id_tipo_bolsa').optional().isInt({min:1}).withMessage('id_tipo_bolsa inválido'),
    body('nombre_subtipo_bolsa').optional().trim().isLength({min:2,max:100}).withMessage('nombre_subtipo_bolsa inválido'),
    body('descripcion_subtipo').optional({nullable:true}).trim().isLength({max:255}).withMessage('descripcion_subtipo muy larga')
  ],
  validate,
  async (req,res)=>{
    try {
      const id = parseInt(req.params.id,10);
      const { id_tipo_bolsa, nombre_subtipo_bolsa, descripcion_subtipo } = req.body;
      const { rows } = await pool.query(
        `UPDATE subtipos_bolsas
           SET id_tipo_bolsa = COALESCE($1, id_tipo_bolsa),
               nombre_subtipo_bolsa = COALESCE($2, nombre_subtipo_bolsa),
               descripcion_subtipo = COALESCE($3, descripcion_subtipo)
         WHERE id_subtipo_bolsa=$4
         RETURNING id_subtipo_bolsa, id_tipo_bolsa, nombre_subtipo_bolsa, descripcion_subtipo`,
        [id_tipo_bolsa ?? null, nombre_subtipo_bolsa ?? null, descripcion_subtipo ?? null, id]
      );
      if (!rows[0]) return res.status(404).json({ error:'No encontrado' });
      res.json(rows[0]);
    } catch (e) { console.error(e); res.status(500).json({ error:'No se pudo actualizar' }); }
  }
);

// ELIMINAR (si no tiene bolsas relacionadas)
router.delete('/admin/subtipos-bolsas/:id',
  auth, isRole(ADMIN), idParam, validate,
  async (req,res)=>{
    try {
      const id = parseInt(req.params.id,10);
      const dep = await pool.query(`SELECT 1 FROM bolsas WHERE id_subtipo_bolsa=$1 LIMIT 1`,[id]);
      if (dep.rowCount) return res.status(400).json({ error:'Tiene bolsas relacionadas' });
      const r = await pool.query(`DELETE FROM subtipos_bolsas WHERE id_subtipo_bolsa=$1`,[id]);
      if (!r.rowCount) return res.status(404).json({ error:'No encontrado' });
      res.status(204).end();
    } catch (e) { console.error(e); res.status(500).json({ error:'No se pudo eliminar' }); }
  }
);

/* ========== BOLSAS ========== */
// LISTAR (filtros + paginación)
router.get('/admin/bolsas', auth, isRole(ADMIN), [
  ...paginacion,
  query('tipo').optional().isInt({min:1}).withMessage('tipo inválido'),
  query('subtipo').optional().isInt({min:1}).withMessage('subtipo inválido')
], validate, async (req,res)=>{
  try {
    const page = parseInt(req.query.page||'1',10);
    const pageSize = parseInt(req.query.pageSize||'20',10);
    const offset = (page-1)*pageSize;
    const tipo = req.query.tipo ? parseInt(req.query.tipo,10) : null;
    const subtipo = req.query.subtipo ? parseInt(req.query.subtipo,10) : null;

    const where = [];
    const params = [];
    let i = 1;
    if (tipo) { where.push(`b.id_tipo_bolsa = $${i++}`); params.push(tipo); }
    if (subtipo) { where.push(`b.id_subtipo_bolsa = $${i++}`); params.push(subtipo); }
    const whereSql = where.length ? 'WHERE '+where.join(' AND ') : '';

    const sql = `
      WITH base AS (
        SELECT b.id_bolsa, b.ancho, b.alto, b.precio, b.descripcion_bolsa,
               tb.id_tipo_bolsa, tb.nombre_bolsa AS tipo_nombre,
               st.id_subtipo_bolsa, st.nombre_subtipo_bolsa AS subtipo_nombre
        FROM bolsas b
        JOIN tipo_bolsa tb ON tb.id_tipo_bolsa = b.id_tipo_bolsa
        LEFT JOIN subtipos_bolsas st ON st.id_subtipo_bolsa = b.id_subtipo_bolsa
        ${whereSql}
        ORDER BY b.id_bolsa DESC
      )
      SELECT (SELECT COUNT(*) FROM base)::int AS total,
             COALESCE(JSON_AGG(base) FILTER(WHERE base.id_bolsa IS NOT NULL), '[]') AS items
      FROM (SELECT * FROM base LIMIT $${i}::int OFFSET $${i+1}::int) base;
    `;
    const { rows } = await pool.query(sql, [...params, pageSize, offset]);
    res.json({ total: rows[0].total, page, pageSize, items: rows[0].items });
  } catch (e) { console.error(e); res.status(500).json({ error:'No se pudo listar' }); }
});

// CREAR bolsa
router.post('/admin/bolsas',
  auth, isRole(ADMIN),
  [
    body('id_tipo_bolsa').isInt({min:1}).withMessage('id_tipo_bolsa requerido'),
    body('id_subtipo_bolsa').optional({nullable:true}).isInt({min:1}).withMessage('id_subtipo_bolsa inválido'),
    body('ancho').isFloat({gt:0}).withMessage('ancho > 0'),
    body('alto').isFloat({gt:0}).withMessage('alto > 0'),
    body('precio').isFloat({gt:0}).withMessage('precio > 0'),
    body('descripcion_bolsa').optional({nullable:true}).isString().trim().isLength({max:500}).withMessage('descripcion muy larga')
  ],
  validate,
  async (req,res)=>{
    try {
      const { id_tipo_bolsa, id_subtipo_bolsa, ancho, alto, precio, descripcion_bolsa } = req.body;
      const { rows } = await pool.query(
        `INSERT INTO bolsas (id_tipo_bolsa, id_subtipo_bolsa, ancho, alto, precio, descripcion_bolsa)
         VALUES ($1,$2,$3,$4,$5,$6)
         RETURNING id_bolsa, id_tipo_bolsa, id_subtipo_bolsa, ancho, alto, precio, descripcion_bolsa`,
        [id_tipo_bolsa, id_subtipo_bolsa ?? null, ancho, alto, precio, descripcion_bolsa ?? null]
      );
      res.status(201).json(rows[0]);
    } catch (e) { console.error(e); res.status(500).json({ error:'No se pudo crear' }); }
  }
);

// ACTUALIZAR bolsa
router.put('/admin/bolsas/:id',
  auth, isRole(ADMIN),
  [
    ...idParam,
    body('id_tipo_bolsa').optional().isInt({min:1}).withMessage('id_tipo_bolsa inválido'),
    body('id_subtipo_bolsa').optional({nullable:true}).isInt({min:1}).withMessage('id_subtipo_bolsa inválido'),
    body('ancho').optional().isFloat({gt:0}).withMessage('ancho > 0'),
    body('alto').optional().isFloat({gt:0}).withMessage('alto > 0'),
    body('precio').optional().isFloat({gt:0}).withMessage('precio > 0'),
    body('descripcion_bolsa').optional({nullable:true}).isString().trim().isLength({max:500}).withMessage('descripcion muy larga')
  ],
  validate,
  async (req,res)=>{
    try {
      const id = parseInt(req.params.id,10);
      const { id_tipo_bolsa, id_subtipo_bolsa, ancho, alto, precio, descripcion_bolsa } = req.body;
      const { rows } = await pool.query(
        `UPDATE bolsas SET
           id_tipo_bolsa   = COALESCE($1, id_tipo_bolsa),
           id_subtipo_bolsa= COALESCE($2, id_subtipo_bolsa),
           ancho           = COALESCE($3, ancho),
           alto            = COALESCE($4, alto),
           precio          = COALESCE($5, precio),
           descripcion_bolsa = COALESCE($6, descripcion_bolsa)
         WHERE id_bolsa=$7
         RETURNING id_bolsa, id_tipo_bolsa, id_subtipo_bolsa, ancho, alto, precio, descripcion_bolsa`,
        [id_tipo_bolsa ?? null, id_subtipo_bolsa ?? null, ancho ?? null, alto ?? null, precio ?? null, descripcion_bolsa ?? null, id]
      );
      if (!rows[0]) return res.status(404).json({ error:'No encontrado' });
      res.json(rows[0]);
    } catch (e) { console.error(e); res.status(500).json({ error:'No se pudo actualizar' }); }
  }
);

// ELIMINAR bolsa
router.delete('/admin/bolsas/:id',
  auth, isRole(ADMIN), idParam, validate,
  async (req,res)=>{
    try {
      const id = parseInt(req.params.id,10);
      // opcional: validar que no esté en órdenes recientes
      const enOrden = await pool.query(`SELECT 1 FROM orden_productos WHERE id_bolsa=$1 LIMIT 1`,[id]);
      if (enOrden.rowCount) return res.status(400).json({ error:'Bolsa usada en órdenes; no se puede eliminar' });

      const r = await pool.query(`DELETE FROM bolsas WHERE id_bolsa=$1`,[id]);
      if (!r.rowCount) return res.status(404).json({ error:'No encontrado' });
      res.status(204).end();
    } catch (e) { console.error(e); res.status(500).json({ error:'No se pudo eliminar' }); }
  }
);

module.exports = router;
