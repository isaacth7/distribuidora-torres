const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // ssl: { rejectUnauthorized: false } // <-- descomenta si tu proveedor lo requiere en producción
});

pool.on('error', (err) => {
  console.error('Error inesperado en el pool', err);
});

module.exports = { pool };
