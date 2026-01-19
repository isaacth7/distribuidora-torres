// routes/imagenes_subtipos.js
const express = require('express');
const { pool } = require('../config/db');
const auth = require('../middlewares/auth');
const { isRole } = require('../middlewares/roles');
const validate = require('../middlewares/validate');
const { body, param } = require('express-validator');

const fs = require('fs');
const path = require('path');
const multer = require('multer');

const {
  listBySubtipoValidator,
  createImageValidator,
  updateImageValidator,
} = require('../validators/imagenesValidators');

const router = express.Router();
const ADMIN = 2;

/* ========= Multer config (local) ========= */
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const base = path
      .basename(file.originalname, ext)
      .replace(/\s+/g, '-')
      .toLowerCase();
    cb(null, `${Date.now()}-${base}${ext}`);
  },
});

const fileFilter = (_req, file, cb) => {
  const ok = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'].includes(file.mimetype);
  cb(ok ? null : new Error('Tipo de archivo no permitido'), ok);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});

/* ========= Validadores mínimos para upload ========= */
const uploadImageValidators = [
  param('id_subtipo').isInt({ min: 1 }).withMessage('id_subtipo inválido'),
  body('descripcion').optional({ nullable: true }).isString().trim().isLength({ max: 255 }).withMessage('descripcion muy larga'),
  body('orden').optional().isInt({ min: 1 }).withMessage('orden debe ser entero >= 1'),
];

/* ========= PÚBLICO: obtener imágenes por subtipo =========
   GET /api/subtipos/:id_subtipo/imagenes?page=&pageSize=
*/
router.get('/subtipos/:id_subtipo/imagenes', listBySubtipoValidator, validate, async (req, res) => {
  try {
    const id_subtipo = parseInt(req.params.id_subtipo, 10);
    const page = parseInt(req.query.page || '1', 10);
    const pageSize = parseInt(req.query.pageSize || '50', 10);
    const offset = (page - 1) * pageSize;

    const sql = `
      WITH base AS (
        SELECT i.id_imagen, i.url_imagen, i.descripcion, i.orden
        FROM imagenes_subtipos i
        WHERE i.id_subtipo_bolsa = $1
        ORDER BY i.orden ASC, i.id_imagen ASC
      )
      SELECT
        (SELECT COUNT(*) FROM base)::int AS total,
        COALESCE(JSON_AGG(b ORDER BY b.orden, b.id_imagen) FILTER (WHERE b.id_imagen IS NOT NULL), '[]') AS items
      FROM (SELECT * FROM base LIMIT $2 OFFSET $3) b;
    `;
    const { rows } = await pool.query(sql, [id_subtipo, pageSize, offset]);
    res.json({
      total: rows[0].total,
      page,
      pageSize,
      totalPages: Math.ceil(rows[0].total / pageSize),
      items: rows[0].items,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'No se pudieron obtener las imágenes' });
  }
});

/* ========= ADMIN: listar imágenes de un subtipo =========
   GET /api/admin/subtipos/:id_subtipo/imagenes
*/
router.get(
  '/admin/subtipos/:id_subtipo/imagenes',
  auth, isRole(ADMIN), listBySubtipoValidator, validate,
  async (req, res) => {
    try {
      const id_subtipo = parseInt(req.params.id_subtipo, 10);
      const page = parseInt(req.query.page || '1', 10);
      const pageSize = parseInt(req.query.pageSize || '50', 10);
      const offset = (page - 1) * pageSize;

      const sql = `
        WITH base AS (
          SELECT i.id_imagen, i.url_imagen, i.descripcion, i.orden
          FROM imagenes_subtipos i
          WHERE i.id_subtipo_bolsa = $1
          ORDER BY i.orden ASC, i.id_imagen ASC
        )
        SELECT
          (SELECT COUNT(*) FROM base)::int AS total,
          COALESCE(JSON_AGG(b ORDER BY b.orden, b.id_imagen) FILTER (WHERE b.id_imagen IS NOT NULL), '[]') AS items
        FROM (SELECT * FROM base LIMIT $2 OFFSET $3) b;
      `;
      const { rows } = await pool.query(sql, [id_subtipo, pageSize, offset]);
      res.json({
        total: rows[0].total,
        page,
        pageSize,
        totalPages: Math.ceil(rows[0].total / pageSize),
        items: rows[0].items,
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'No se pudieron listar las imágenes' });
    }
  }
);

/* ========= ADMIN: crear imagen por URL =========
   POST /api/admin/subtipos/:id_subtipo/imagenes
   Body: { url_imagen, descripcion?, orden? }
*/
router.post(
  '/admin/subtipos/:id_subtipo/imagenes',
  auth, isRole(ADMIN), createImageValidator, validate,
  async (req, res) => {
    try {
      const id_subtipo = parseInt(req.params.id_subtipo, 10);
      const { url_imagen, descripcion, orden } = req.body;

      const chk = await pool.query('SELECT 1 FROM subtipos_bolsas WHERE id_subtipo_bolsa=$1', [id_subtipo]);
      if (!chk.rowCount) return res.status(400).json({ error: 'subtipo no existe' });

      const { rows } = await pool.query(
        `INSERT INTO imagenes_subtipos (id_subtipo_bolsa, url_imagen, descripcion, orden)
         VALUES ($1,$2,$3, COALESCE($4, 1))
         RETURNING id_imagen, id_subtipo_bolsa, url_imagen, descripcion, orden`,
        [id_subtipo, url_imagen, descripcion ?? null, orden ?? 1]
      );
      res.status(201).json(rows[0]);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'No se pudo crear la imagen' });
    }
  }
);

/* ========= ADMIN: actualizar imagen =========
   PUT /api/admin/imagenes/:id
   Body: { url_imagen?, descripcion?, orden? }
*/
router.put(
  '/admin/imagenes/:id',
  auth, isRole(ADMIN), updateImageValidator, validate,
  async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const { url_imagen, descripcion, orden } = req.body;

      const { rows } = await pool.query(
        `UPDATE imagenes_subtipos
           SET url_imagen = COALESCE($1, url_imagen),
               descripcion = COALESCE($2, descripcion),
               orden = COALESCE($3, orden)
         WHERE id_imagen = $4
         RETURNING id_imagen, id_subtipo_bolsa, url_imagen, descripcion, orden`,
        [url_imagen ?? null, descripcion ?? null, orden ?? null, id]
      );
      if (!rows[0]) return res.status(404).json({ error: 'Imagen no encontrada' });
      res.json(rows[0]);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'No se pudo actualizar la imagen' });
    }
  }
);

/* ========= ADMIN: eliminar imagen =========
   DELETE /api/admin/imagenes/:id
*/
router.delete(
  '/admin/imagenes/:id',
  auth, isRole(ADMIN), param('id').isInt({ min: 1 }), validate,
  async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const r = await pool.query('DELETE FROM imagenes_subtipos WHERE id_imagen=$1', [id]);
      if (!r.rowCount) return res.status(404).json({ error: 'Imagen no encontrada' });
      res.status(204).end();
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'No se pudo eliminar la imagen' });
    }
  }
);

/* ========= ADMIN: subir archivo (multipart) =========
   POST /api/admin/subtipos/:id_subtipo/imagenes/upload
   Form-data:
     - file: (binary)  ← requerido
     - descripcion?: string
     - orden?: number
*/
router.post(
  '/admin/subtipos/:id_subtipo/imagenes/upload',
  auth,
  isRole(ADMIN),
  upload.single('file'),      // procesa archivo
  uploadImageValidators,      // valida id_subtipo + opcionales
  validate,                   // envía 400 si falla validación
  async (req, res) => {
    try {
      const id_subtipo = parseInt(req.params.id_subtipo, 10);
      const { descripcion, orden } = req.body;

      if (!req.file) return res.status(400).json({ error: 'Archivo (file) es requerido' });

      const chk = await pool.query('SELECT 1 FROM subtipos_bolsas WHERE id_subtipo_bolsa=$1', [id_subtipo]);
      if (!chk.rowCount) return res.status(400).json({ error: 'subtipo no existe' });

      const publicUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;

      const { rows } = await pool.query(
        `INSERT INTO imagenes_subtipos (id_subtipo_bolsa, url_imagen, descripcion, orden)
         VALUES ($1, $2, $3, COALESCE($4, 1))
         RETURNING id_imagen, id_subtipo_bolsa, url_imagen, descripcion, orden`,
        [id_subtipo, publicUrl, descripcion ?? null, orden ? parseInt(orden, 10) : null]
      );

      res.status(201).json(rows[0]);
    } catch (e) {
      console.error(e);
      // Limpieza opcional del archivo si falló algo
      if (req.file) {
        try { fs.unlinkSync(path.join(UPLOADS_DIR, req.file.filename)); } catch (_) {}
      }
      if (e instanceof multer.MulterError || e.message?.includes('Tipo de archivo')) {
        return res.status(400).json({ error: e.message });
      }
      res.status(500).json({ error: 'No se pudo subir la imagen' });
    }
  }
);

module.exports = router;
