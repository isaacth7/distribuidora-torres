const express = require('express');
const { pool } = require('../config/db');
const router = express.Router();

// Métodos de pago
router.get('/metodos-pago', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id_metodo_pago, nombre, descripcion FROM metodos_pago ORDER BY id_metodo_pago ASC`
    );
    res.json(rows);
  } catch (e) { console.error(e); res.status(500).json({ error: 'No se pudieron obtener los métodos de pago' }); }
});

// Tipos de entrega
router.get('/tipos-entrega', async (_req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id_tipo_entrega, nombre, descripcion FROM tipos_entrega ORDER BY id_tipo_entrega ASC`
    );
    res.json(rows);
  } catch (e) { console.error(e); res.status(500).json({ error: 'No se pudieron obtener los tipos de entrega' }); }
});

module.exports = router;