require('dotenv').config();

const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');

const app = express();
const PORT = process.env.PORT || 3000;

/* ---------- CORS ---------- */
const raw =
  process.env.FRONTEND_ORIGIN ||
  'http://127.0.0.1:5500,http://localhost:5500,http://localhost:5173';

const FROM_ENV = raw.split(',').map(s => s.trim()).filter(Boolean);

const SWAGGER_ORIGIN = `http://localhost:${PORT}`;
const isNetlify = (origin) => /^https:\/\/.*\.netlify\.app$/.test(origin);

const ALLOWED_ORIGINS = new Set([
  ...FROM_ENV,
  SWAGGER_ORIGIN,
  `http://localhost:${PORT}`,
]);

const corsOptions = {
  origin(origin, cb) {
    // requests server-to-server o herramientas sin Origin (curl/postman)
    if (!origin) return cb(null, true);

    if (
      ALLOWED_ORIGINS.has(origin) ||
      /^http:\/\/localhost:\d+$/.test(origin) ||
      isNetlify(origin)
    ) {
      return cb(null, true);
    }

    console.warn('[CORS] Origin no permitido:', origin);
    return cb(null, false);
  },
  credentials: true, // si no usas cookies, lo puedes dejar igual; no rompe Bearer
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204,
};

const adminSubtipos = require('./routes/admin_subtipos');
console.log('[admin_subtipos] typeof:', typeof adminSubtipos, adminSubtipos);
app.use('/api', adminSubtipos);


app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));

/* ---------- Static uploads ---------- */
const UPLOADS_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
app.use('/uploads', express.static(UPLOADS_DIR));

/* ---------- Middlewares ---------- */
app.set('trust proxy', 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '1mb' }));

/* ---------- Rate limits ---------- */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de login, intenta más tarde' },
});
const checkoutLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes de checkout' },
});
app.use('/api/auth/login', loginLimiter);
app.use('/api/orders/checkout', checkoutLimiter);

/* ---------- Swagger ---------- */
const swaggerDoc = YAML.load(path.join(__dirname, 'docs', 'openapi.yaml'));
app.use(
  '/api/docs',
  swaggerUi.serve,
  swaggerUi.setup(swaggerDoc, {
    swaggerOptions: { persistAuthorization: true },
  })
);

/* ---------- Utils ---------- */
app.get('/api/health', (_req, res) =>
  res.json({ ok: true, message: 'Servidor vivo' })
);

app.get('/api/test-db', async (_req, res) => {
  try {
    const { pool } = require('./config/db');
    const r = await pool.query('SELECT NOW()');
    res.json({ conexion: 'ok', hora: r.rows[0].now });
  } catch (err) {
    console.error(err);
    res.status(500).json({ conexion: 'error', detalle: err.message });
  }
});

/* ---------- Rutas ---------- */
app.use('/api/auth', require('./routes/auth'));
app.use('/api', require('./routes/catalogo'));
app.use('/api', require('./routes/cart'));
app.use('/api', require('./routes/direcciones'));
app.use('/api', require('./routes/catalogos_aux'));
app.use('/api', require('./routes/orders'));
app.use('/api', require('./routes/orders_admin'));
app.use('/api', require('./routes/estados'));
app.use('/api', require('./routes/admin_catalogo'));
app.use('/api', require('./routes/imagenes_subtipos'));
app.use('/api', require('./routes/users'));
app.use('/api', require('./routes/admin_users'));
app.use('/api', require('./routes/pricing'));
app.use('/api', require('./routes/admin_subtipos'));


/* ---------- 404 & errores ---------- */
app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
app.use(require('./middlewares/errorHandler'));

/* ---------- Start ---------- */
app.listen(PORT, () => {
  console.log(`✅ Backend escuchando en http://localhost:${PORT}`);
  console.log(
    '   CORS Origins permitidos:',
    Array.from(ALLOWED_ORIGINS).join(' | ')
  );
});
