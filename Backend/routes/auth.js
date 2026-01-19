const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { pool } = require('../config/db');

// 🔒 Validadores
const validate = require('../middlewares/validate');
const {
  registerValidator,
  loginValidator,
  forgotPasswordValidator,
  resetPasswordValidator
} = require('../validators/authValidators');

console.log('[env check]', {
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: process.env.SMTP_PORT,
  SMTP_USER: process.env.SMTP_USER,
  NODE_ENV: process.env.NODE_ENV
});

const crypto = require('crypto');
const { enviarCorreoRestablecimiento } = require('../utils/mailer');

const router = express.Router();

/* =========================
   Rol por defecto (sin slug)
   ========================= */
const DEFAULT_ROLE_ID   = process.env.DEFAULT_ROLE_ID
  ? Number(process.env.DEFAULT_ROLE_ID)
  : null;

const DEFAULT_ROLE_NAME = (process.env.DEFAULT_ROLE_NAME || 'cliente').toLowerCase();

let cachedDefaultRoleId = null;

async function getDefaultRoleIdSafe() {
  // 1) Si viene fijo por .env, úsalo
  if (DEFAULT_ROLE_ID != null && !Number.isNaN(DEFAULT_ROLE_ID)) {
    return DEFAULT_ROLE_ID;
  }

  // 2) Cache
  if (cachedDefaultRoleId != null) return cachedDefaultRoleId;

  // 3) Busca por nombre en roles_usuarios (ajusta el nombre de tabla si usas otro)
  try {
    const { rows } = await pool.query(
      `SELECT id_rol_usuario
         FROM roles_usuarios
        WHERE LOWER(nombre) = $1
        LIMIT 1`,
      [DEFAULT_ROLE_NAME]
    );
    if (rows[0]) {
      cachedDefaultRoleId = Number(rows[0].id_rol_usuario);
      return cachedDefaultRoleId;
    }
  } catch (e) {
    // 42P01 = tabla no existe. Deja rol en NULL o usa DEFAULT_ROLE_ID si existiera.
    if (e.code === '42P01') {
      console.warn('[auth] Tabla roles_usuarios no existe; usando rol NULL/DEFAULT_ROLE_ID');
      return DEFAULT_ROLE_ID ?? null;
    }
    throw e;
  }

  // 4) Si no se encontró por nombre, devuelve NULL (columna permite null)
  return null;
}

/**
 * POST /api/auth/register
 * Body: { nombre?, primer_apellido?, segundo_apellido?, correo, contrasena }
 * - Ignora id_rol_usuario del body (seguridad)
 * - Asigna rol por defecto (cliente)
 */
router.post('/register', registerValidator, validate, async (req, res) => {
  try {
    const {
      nombre,
      primer_apellido,
      segundo_apellido,
      correo,
      contrasena,
      id_rol_usuario, // opcional
      negocio,
    } = req.body;

    const rolPorDefecto = await getDefaultRoleIdSafe();
    const rol = (id_rol_usuario != null) ? Number(id_rol_usuario) : rolPorDefecto; // puede quedar null

    const hash = await bcrypt.hash(contrasena, 10);

    const { rows } = await pool.query(
      `INSERT INTO usuarios (id_rol_usuario, nombre, primer_apellido, segundo_apellido, correo, contrasena, negocio)
       VALUES ($1,$2,$3,$4,$5,$6, $7)
       RETURNING id_usuario, id_rol_usuario, nombre, primer_apellido, segundo_apellido, correo, fecha_registro, negocio`,
      [rol ?? null, nombre || null, primer_apellido || null, segundo_apellido || null, correo, hash, negocio || null]
    );

    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'El correo ya está registrado' });
    console.error(err);
    res.status(500).json({ error: 'Error registrando usuario' });
  }
});


/**
 * POST /api/auth/login
 * Body: { correo, contrasena }
 */
router.post('/login', loginValidator, validate, async (req, res) => {
  try {
    const { correo, contrasena } = req.body; // correo ya validado/normalizado

    const { rows } = await pool.query(
      `SELECT id_usuario, id_rol_usuario, nombre, primer_apellido, segundo_apellido, correo, contrasena, negocio
         FROM usuarios
        WHERE correo = $1`,
      [correo]
    );
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Credenciales inválidas' });

    const ok = await bcrypt.compare(contrasena, user.contrasena);
    if (!ok) return res.status(401).json({ error: 'Credenciales inválidas' });

    const token = jwt.sign(
      { sub: user.id_usuario, rol: user.id_rol_usuario },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES || '1d' }
    );

    delete user.contrasena;
    return res.json({ user, token });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error en login' });
  }
});

/* =========================
   Cambio de contraseña POST /api/auth/olvido-contrasena
   ========================= */

router.post('/olvido-contrasena', forgotPasswordValidator, validate, async (req, res) => {
  try {
    const { correo } = req.body;

    const { rows } = await pool.query(
      `SELECT id_usuario, correo
         FROM usuarios
        WHERE correo = $1
        LIMIT 1`,
      [correo]
    );

    // Anti-enumeración
    if (!rows[0]) return res.json({ ok: true });

    const usuario = rows[0];

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const fechaExpiracion = new Date(Date.now() + 30 * 60 * 1000);

    await pool.query(
      `INSERT INTO restablecimientos_contrasena
        (id_usuario, token_hash, fecha_expiracion)
       VALUES ($1, $2, $3)`,
      [usuario.id_usuario, tokenHash, fechaExpiracion]
    );

    const urlRestablecimiento =
      `${process.env.APP_URL}/Reset-Password.html?token=${token}`;

    await enviarCorreoRestablecimiento(usuario.correo, urlRestablecimiento);

    return res.json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Error procesando solicitud' });
  }
});

/* =========================
   POST /api/auth/restablecer-contrasena
   ========================= */

router.post('/restablecer-contrasena', resetPasswordValidator, validate, async (req, res) => {
  try {
    const { token, contrasena } = req.body;

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const { rows } = await pool.query(
      `SELECT id_restablecimiento, id_usuario, fecha_expiracion, fecha_uso
         FROM restablecimientos_contrasena
        WHERE token_hash = $1
        ORDER BY fecha_creacion DESC
        LIMIT 1`,
      [tokenHash]
    );

    const registro = rows[0];
    if (!registro) {
      return res.status(400).json({ error: 'Token inválido' });
    }
    if (registro.fecha_uso) {
      return res.status(400).json({ error: 'El token ya fue utilizado' });
    }
    if (new Date(registro.fecha_expiracion) < new Date()) {
      return res.status(400).json({ error: 'El token ha expirado' });
    }

    const hash = await bcrypt.hash(contrasena, 10);

    await pool.query('BEGIN');

    await pool.query(
      `UPDATE usuarios
          SET contrasena = $1
        WHERE id_usuario = $2`,
      [hash, registro.id_usuario]
    );

    await pool.query(
      `UPDATE restablecimientos_contrasena
          SET fecha_uso = NOW()
        WHERE id_restablecimiento = $1`,
      [registro.id_restablecimiento]
    );

    await pool.query('COMMIT');

    return res.json({ ok: true });
  } catch (err) {
    await pool.query('ROLLBACK').catch(() => {});
    console.error(err);
    return res.status(500).json({ error: 'Error restableciendo contraseña' });
  }
});


module.exports = router;
