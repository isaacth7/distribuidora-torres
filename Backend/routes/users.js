const express = require('express');
const { pool } = require('../config/db');
const auth = require('../middlewares/auth');
const validate = require('../middlewares/validate');
const { body } = require('express-validator');
const bcrypt = require('bcrypt');

const router = express.Router();

/** PUT /api/users/me  (editar perfil: nombre, apellidos, correo) */
router.put(
  '/users/me',
  auth,
  [
    body('nombre').optional().isString().trim().isLength({ min: 1, max: 100 }),
    body('primer_apellido').optional().isString().trim().isLength({ min: 1, max: 100 }),
    body('segundo_apellido').optional().isString().trim().isLength({ min: 1, max: 100 }),
    body('correo').optional().trim().toLowerCase().isEmail().withMessage('correo inválido'),
    body('negocio').optional().isString().trim().isLength({ max: 150 }),
  ],
  validate,
  async (req, res) => {
    try {
      const uid = Number(req.user.sub);
      if (!Number.isFinite(uid)) {
        return res.status(401).json({ error: 'Token inválido' });
      }

      const { nombre, primer_apellido, segundo_apellido, correo, negocio } = req.body;

      const { rows, rowCount } = await pool.query(
        `UPDATE usuarios
           SET nombre           = COALESCE($1, nombre),
               primer_apellido  = COALESCE($2, primer_apellido),
               segundo_apellido = COALESCE($3, segundo_apellido),
               correo           = COALESCE($4, correo),
               negocio          = COALESCE($5, negocio)
         WHERE id_usuario = $6
         RETURNING id_usuario, id_rol_usuario, nombre, primer_apellido, segundo_apellido, correo, negocio, fecha_registro`,
        [nombre ?? null, primer_apellido ?? null, segundo_apellido ?? null, correo ?? null, negocio ?? null, uid]
      );

      if (!rowCount) return res.status(404).json({ error: 'Usuario no encontrado' });
      res.json(rows[0]);
    } catch (e) {
      if (e.code === '23505') return res.status(409).json({ error: 'Correo ya está registrado' });
      console.error('[PUT /users/me] ERROR', { code: e.code, message: e.message, detail: e.detail });
      return res.status(500).json({ error: 'No se pudo actualizar el usuario' });
    }
  }
);



/** PATCH /api/users/me/password  (cambiar contraseña) */
router.patch(
  '/users/me/password',
  auth,
  [
    body('contrasena_actual').isString().isLength({ min: 8 }),
    body('contrasena_nueva').isString().isLength({ min: 8 }),
  ],
  validate,
  async (req, res) => {
    const { contrasena_actual, contrasena_nueva } = req.body;
    try {
      const uid = Number(req.user.sub);
      if (!Number.isFinite(uid)) return res.status(401).json({ error: 'Token inválido' });

      const { rows } = await pool.query(
        'SELECT contrasena FROM usuarios WHERE id_usuario=$1',
        [uid]
      );
      if (!rows[0]) return res.status(404).json({ error: 'Usuario no encontrado' });

      const ok = await bcrypt.compare(contrasena_actual, rows[0].contrasena);
      if (!ok) return res.status(401).json({ error: 'Contraseña actual incorrecta' });

      const hash = await bcrypt.hash(contrasena_nueva, 10);

      // ➜ Si NO tienes la columna, usa la variante sin actualizado_en
      await pool.query(
        'UPDATE usuarios SET contrasena=$1 WHERE id_usuario=$2',
        [hash, uid]
      );

      return res.sendStatus(204);
    } catch (e) {
      console.error('[PATCH /users/me/password]', { code: e.code, message: e.message, detail: e.detail });
      return res.status(500).json({ error: 'No se pudo cambiar la contraseña' });
    }
  }
);


module.exports = router;
