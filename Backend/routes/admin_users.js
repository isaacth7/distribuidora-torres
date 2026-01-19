const express = require('express');
const { pool } = require('../config/db');
const auth = require('../middlewares/auth');
const { isRole } = require('../middlewares/roles');
const { body, param, query } = require('express-validator');
const validate = require('../middlewares/validate');
const bcrypt = require('bcrypt');

const ADMIN = 2;
const router = express.Router();

/** GET /api/admin/users?correo=&rol=&page=&pageSize= */
router.get(
  '/admin/users',
  auth, isRole(ADMIN),
  [
    query('correo').optional().isString(),
    query('rol').optional().isInt({ min: 1 }),
    query('page').optional().isInt({ min: 1 }).toInt(),
    query('pageSize').optional().isInt({ min: 1, max: 100 }).toInt(),
  ],
  validate,
  async (req, res) => {
    const { correo, rol } = req.query;
    const page = req.query.page || 1;
    const pageSize = req.query.pageSize || 20;
    const offset = (page - 1) * pageSize;

    const where = [];
    const params = [];
    if (correo) { params.push(`%${correo}%`); where.push(`LOWER(correo) LIKE LOWER($${params.length})`); }
    if (rol) { params.push(rol); where.push(`id_rol_usuario = $${params.length}`); }

    const W = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const dataQ = `
      SELECT id_usuario, id_rol_usuario, nombre, primer_apellido, segundo_apellido, correo, negocio, fecha_registro
        FROM usuarios
        ${W}
       ORDER BY id_usuario DESC
       LIMIT ${pageSize} OFFSET ${offset}`;
    const countQ = `SELECT COUNT(*)::int AS total FROM usuarios ${W}`;

    const [data, cnt] = await Promise.all([
      pool.query(dataQ, params),
      pool.query(countQ, params),
    ]);
    res.json({ data: data.rows, page, pageSize, total: cnt.rows[0].total });
  }
);

/** GET /api/admin/users/:id */
router.get(
  '/admin/users/:id',
  auth, isRole(ADMIN),
  [param('id').isInt({ min: 1 })],
  validate,
  async (req, res) => {
    const { rows } = await pool.query(
      `SELECT id_usuario, id_rol_usuario, nombre, primer_apellido, segundo_apellido, correo, negocio, fecha_registro
     FROM usuarios WHERE id_usuario=$1`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Usuario no encontrado' });
    res.json(rows[0]);
  }
);

/** PUT /api/admin/users/:id  (editar datos de contacto) */
router.put(
  '/admin/users/:id',
  auth, isRole(ADMIN),
  [
    param('id').isInt({ min: 1 }),

    body('nombre').optional().isString().trim().isLength({ min: 1, max: 100 }),
    body('primer_apellido').optional().isString().trim().isLength({ min: 1, max: 100 }),
    body('segundo_apellido').optional().isString().trim().isLength({ min: 1, max: 100 }),

    body('correo').optional().trim().toLowerCase().isEmail().withMessage('correo inválido'),

    // ⚠️ Ajustá el nombre al de tu DB: nombre_negocio / negocio / empresa / etc.
    body('negocio').optional({ nullable: true }).isString().trim().isLength({ max: 150 }),
  ],
  validate,
  async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const { nombre, primer_apellido, segundo_apellido, correo, negocio } = req.body;

      // ✅ Si viene correo, validar que no lo tenga otro usuario
      if (correo) {
        const { rowCount } = await pool.query(
          `SELECT 1 FROM usuarios WHERE LOWER(correo)=LOWER($1) AND id_usuario <> $2 LIMIT 1`,
          [correo, id]
        );
        if (rowCount) return res.status(409).json({ error: 'Correo ya está registrado' });
      }

      const r = await pool.query(
        `UPDATE usuarios
      SET nombre = COALESCE($1, nombre),
          primer_apellido = COALESCE($2, primer_apellido),
          segundo_apellido = COALESCE($3, segundo_apellido),
          correo = COALESCE($4, correo),
          negocio = COALESCE($5, negocio)
    WHERE id_usuario = $6
  RETURNING id_usuario, id_rol_usuario, nombre, primer_apellido, segundo_apellido, correo, negocio, fecha_registro`,
        [
          nombre ?? null,
          primer_apellido ?? null,
          segundo_apellido ?? null,
          correo ?? null,
          negocio ?? null,
          id
        ]
      );


      if (!r.rows[0]) return res.status(404).json({ error: 'Usuario no encontrado' });
      res.json(r.rows[0]);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'No se pudo actualizar el usuario' });
    }
  }
);

module.exports = router;
