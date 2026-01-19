const express = require('express');
const { pool } = require('../config/db');
const auth = require('../middlewares/auth');
const router = express.Router();

// LISTAR mis direcciones
router.get('/direcciones', auth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id_direccion, direccion_exacta, distrito, canton, provincia, codigo_postal, activa, fecha_registro
       FROM direcciones_usuario
       WHERE id_usuario = $1
       ORDER BY activa DESC, fecha_registro DESC`,
      [req.user.sub]
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'No se pudieron obtener las direcciones' });
  }
});

// OBTENER una dirección específica
router.get('/direcciones/:id', auth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { rows } = await pool.query(
      `SELECT id_direccion, direccion_exacta, distrito, canton, provincia, codigo_postal, activa, fecha_registro
       FROM direcciones_usuario
       WHERE id_direccion = $1 AND id_usuario = $2`,
      [id, req.user.sub]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Dirección no encontrada' });
    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'No se pudo obtener la dirección' });
  }
});

// CREAR nueva dirección
router.post('/direcciones', auth, async (req, res) => {
  try {
    const { direccion_exacta, distrito, canton, provincia, codigo_postal, activa } = req.body;
    if (!direccion_exacta || !provincia || !canton || !distrito)
      return res.status(400).json({ error: 'Campos requeridos: direccion_exacta, provincia, canton, distrito' });

    const { rows } = await pool.query(
      `INSERT INTO direcciones_usuario
         (id_usuario, direccion_exacta, distrito, canton, provincia, codigo_postal, activa)
       VALUES ($1,$2,$3,$4,$5,$6, COALESCE($7, TRUE))
       RETURNING id_direccion, direccion_exacta, distrito, canton, provincia, codigo_postal, activa, fecha_registro`,
      [req.user.sub, direccion_exacta, distrito, canton, provincia, codigo_postal ?? null, activa ?? true]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'No se pudo crear la dirección' });
  }
});

// ACTUALIZAR dirección
router.put('/direcciones/:id', auth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { direccion_exacta, distrito, canton, provincia, codigo_postal, activa } = req.body;

    const { rows } = await pool.query(
      `UPDATE direcciones_usuario
       SET direccion_exacta = COALESCE($1, direccion_exacta),
           distrito         = COALESCE($2, distrito),
           canton           = COALESCE($3, canton),
           provincia        = COALESCE($4, provincia),
           codigo_postal    = COALESCE($5, codigo_postal),
           activa           = COALESCE($6, activa)
       WHERE id_direccion = $7 AND id_usuario = $8
       RETURNING id_direccion, direccion_exacta, distrito, canton, provincia, codigo_postal, activa, fecha_registro`,
      [direccion_exacta ?? null, distrito ?? null, canton ?? null, provincia ?? null, codigo_postal ?? null, activa ?? null, id, req.user.sub]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Dirección no encontrada' });
    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'No se pudo actualizar la dirección' });
  }
});

// ACTIVAR/INACTIVAR
router.patch('/direcciones/:id/activar', auth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const activa = Boolean(req.body.activa);
    const { rows } = await pool.query(
      `UPDATE direcciones_usuario
       SET activa = $1
       WHERE id_direccion = $2 AND id_usuario = $3
       RETURNING id_direccion, activa`,
      [activa, id, req.user.sub]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Dirección no encontrada' });
    res.json(rows[0]);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'No se pudo actualizar el estado' });
  }
});

// ELIMINAR dirección
router.delete('/direcciones/:id', auth, async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { rowCount } = await pool.query(
      `DELETE FROM direcciones_usuario WHERE id_direccion = $1 AND id_usuario = $2`,
      [id, req.user.sub]
    );
    if (!rowCount) return res.status(404).json({ error: 'Dirección no encontrada' });
    res.status(204).end();
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'No se pudo eliminar la dirección' });
  }
});

module.exports = router;
