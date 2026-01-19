const express = require('express');
const { pool } = require('../config/db');
const router = express.Router();

// GET /api/estados-orden
router.get('/estados-orden', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id_estado, nombre, descripcion, orden, es_final
       FROM estados_orden
       ORDER BY orden ASC, id_estado ASC`
    );
    res.json(rows);
  } catch (e) { console.error(e); res.status(500).json({ error: 'No se pudieron obtener los estados' }); }
});

module.exports = router;
