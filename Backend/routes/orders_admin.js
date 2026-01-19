// routes/orders_admin.js
const express = require('express');
const { pool } = require('../config/db');
const auth = require('../middlewares/auth');
const { isRole } = require('../middlewares/roles');
const validate = require('../middlewares/validate');
const { body, param, query } = require('express-validator');

const router = express.Router();
const ADMIN = 2;

/**
 * ⚠️ Ajustá estos IDs según tu tabla estados_orden
 * (los usé SOLO para el auto-cambio cuando termina el pesaje)
 */
const EST_PEND_PESAJE = 2;
const EST_PEND_PAGO = 3;

/* ========= VALIDADORES ========= */
const updateOrderStatusValidator = [
  param('id').isInt({ min: 1 }).withMessage('id inválido'),
  body('id_estado')
    .exists().withMessage('id_estado requerido')
    .bail()
    .isInt({ min: 1 }).withMessage('id_estado inválido')
    .bail()
    .custom(async (value) => {
      const { rowCount } = await pool.query(
        'SELECT 1 FROM estados_orden WHERE id_estado=$1',
        [value]
      );
      if (!rowCount) throw new Error('id_estado no existe');
      return true;
    })
];

const listOrdersValidator = [
  query('q').optional().trim().isLength({ min: 1, max: 80 }).withMessage('q inválido'),
  query('estado').optional().trim(),
  query('pago').optional().trim().isLength({ min: 1, max: 80 }).withMessage('pago inválido'),
  query('entrega').optional().trim().isLength({ min: 1, max: 80 }).withMessage('entrega inválida'),
  query('usuario').optional().isInt({ min: 1 }).withMessage('usuario inválido'),
  query('fechaDesde').optional().isISO8601().withMessage('fechaDesde inválida'),
  query('fechaHasta').optional().isISO8601().withMessage('fechaHasta inválida'),
  query('page').optional().isInt({ min: 1 }).withMessage('page inválido'),
  query('pageSize').optional().isInt({ min: 1, max: 100 }).withMessage('pageSize inválido'),
  query('sort')
    .optional()
    .isIn(['fecha_asc', 'fecha_desc', 'total_asc', 'total_desc'])
    .withMessage('sort inválido')
];

const orderIdParam = [
  param('id').isInt({ min: 1 }).withMessage('id inválido')
];

const setItemWeightValidator = [
  param('id').isInt({ min: 1 }).withMessage('id inválido'),
  param('id_bolsa').isInt({ min: 1 }).withMessage('id_bolsa inválido'),
  body('peso_real_total_kg')
    .exists().withMessage('peso_real_total_kg requerido')
    .bail()
    .isFloat({ gt: 0 }).withMessage('peso_real_total_kg debe ser > 0')
    .toFloat()
];

/* ========= PATCH estado de orden ========= */
router.patch(
  '/admin/orders/:id/status',
  auth, isRole(ADMIN),
  updateOrderStatusValidator, validate,
  async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const id_estado = parseInt(req.body.id_estado, 10);

      const { rows } = await pool.query(
        `UPDATE ordenes
            SET id_estado = $1
          WHERE id_orden = $2
        RETURNING id_orden, id_estado`,
        [id_estado, id]
      );

      if (!rows[0]) return res.status(404).json({ error: 'Orden no encontrada' });
      res.json(rows[0]);
    } catch (e) {
      console.error('[admin:orders:status]', e);
      res.status(500).json({ error: 'No se pudo actualizar el estado' });
    }
  }
);

/* ========= GET listado admin ========= */
router.get(
  '/admin/orders',
  auth, isRole(ADMIN),
  listOrdersValidator, validate,
  async (req, res) => {
    try {
      const page = parseInt(req.query.page || '1', 10);
      const pageSize = parseInt(req.query.pageSize || '20', 10);
      const offset = (page - 1) * pageSize;

      const qTxt = req.query.q ? String(req.query.q).trim() : null;
      const usuario = req.query.usuario ? parseInt(req.query.usuario, 10) : null;

      const fechaDesde = req.query.fechaDesde ? new Date(req.query.fechaDesde) : null;
      const fechaHasta = req.query.fechaHasta ? new Date(req.query.fechaHasta) : null;
      if (fechaHasta) fechaHasta.setHours(23, 59, 59, 999);

      const sort = req.query.sort || 'fecha_desc';
      const sortMap = {
        'fecha_desc': 'fecha DESC',
        'fecha_asc': 'fecha ASC',
        'total_desc': 'total DESC',
        'total_asc': 'total ASC'
      };
      const orderBy = sortMap[sort] || sortMap['fecha_desc'];

      // estado puede venir como nombre o id
      let estadoId = null;
      let estadoNombre = null;
      if (req.query.estado) {
        if (/^\d+$/.test(req.query.estado)) estadoId = parseInt(req.query.estado, 10);
        else estadoNombre = String(req.query.estado).trim().toUpperCase();
      }

      // pago / entrega pueden venir como id o texto
      let pagoId = null, pagoTxt = null;
      if (req.query.pago) {
        if (/^\d+$/.test(req.query.pago)) pagoId = parseInt(req.query.pago, 10);
        else pagoTxt = String(req.query.pago).trim();
      }

      let entregaId = null, entregaTxt = null;
      if (req.query.entrega) {
        if (/^\d+$/.test(req.query.entrega)) entregaId = parseInt(req.query.entrega, 10);
        else entregaTxt = String(req.query.entrega).trim();
      }

      const where = [];
      const params = [];
      let i = 1;

      // Buscar (q): por id_orden / id_usuario / correo
      if (qTxt) {
        if (/^\d+$/.test(qTxt)) {
          where.push(`(o.id_orden = $${i} OR o.id_usuario = $${i})`);
          params.push(parseInt(qTxt, 10));
          i++;
        } else {
          where.push(`(u.correo ILIKE $${i})`);
          params.push(`%${qTxt}%`);
          i++;
        }
      }

      if (estadoId != null) { where.push(`o.id_estado = $${i++}`); params.push(estadoId); }
      if (estadoNombre)     { where.push(`UPPER(eo.nombre) = $${i++}`); params.push(estadoNombre); }

      if (usuario)          { where.push(`o.id_usuario = $${i++}`); params.push(usuario); }

      if (pagoId != null)   { where.push(`o.id_metodo_pago = $${i++}`); params.push(pagoId); }
      if (pagoTxt)          { where.push(`mp.nombre ILIKE $${i++}`); params.push(`%${pagoTxt}%`); }

      if (entregaId != null){ where.push(`o.tipo_entrega = $${i++}`); params.push(entregaId); }
      if (entregaTxt)       { where.push(`te.nombre ILIKE $${i++}`); params.push(`%${entregaTxt}%`); }

      if (fechaDesde)       { where.push(`o.fecha >= $${i++}`); params.push(fechaDesde); }
      if (fechaHasta)       { where.push(`o.fecha <= $${i++}`); params.push(fechaHasta); }

      const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

      const sql = `
        WITH base AS (
          SELECT 
            o.id_orden,
            o.fecha,
            o.gran_total AS total,
            u.id_usuario,
            u.correo,
            eo.id_estado,
            eo.nombre AS estado,
            te.nombre AS tipo_entrega,
            mp.nombre AS metodo_pago
          FROM ordenes o
          JOIN usuarios u            ON u.id_usuario = o.id_usuario
          LEFT JOIN estados_orden eo ON eo.id_estado = o.id_estado
          LEFT JOIN tipos_entrega te ON te.id_tipo_entrega = o.tipo_entrega
          LEFT JOIN metodos_pago mp  ON mp.id_metodo_pago = o.id_metodo_pago
          ${whereSql}
          ORDER BY ${orderBy}
        )
        SELECT 
          (SELECT COUNT(*) FROM base)::int AS total,
          COALESCE(
            JSON_AGG(b ORDER BY ${orderBy}) FILTER (WHERE b.id_orden IS NOT NULL),
            '[]'
          ) AS items
        FROM (SELECT * FROM base LIMIT $${i}::int OFFSET $${i + 1}::int) b;
      `;

      const values = [...params, pageSize, offset];
      const { rows } = await pool.query(sql, values);

      res.json({
        total: rows[0].total,
        page,
        pageSize,
        totalPages: Math.max(1, Math.ceil(rows[0].total / pageSize)),
        items: rows[0].items
      });
    } catch (e) {
      console.error('[admin:orders:list]', e);
      res.status(500).json({ error: 'No se pudieron listar las órdenes' });
    }
  }
);

/* ========= GET detalle admin ========= */
router.get(
  '/admin/orders/:id',
  auth, isRole(ADMIN),
  orderIdParam, validate,
  async (req, res) => {
    try {
      const id = Number(req.params.id);

      const rOrden = await pool.query(
        `SELECT  o.id_orden, o.fecha,
                 o.id_estado, eo.nombre AS estado,
                 o.id_usuario, u.correo,
                 o.id_direccion,
                 d.direccion_exacta, d.distrito, d.canton, d.provincia, d.codigo_postal,
                 o.tipo_entrega, te.nombre AS tipo_entrega_nombre,
                 o.id_metodo_pago, mp.nombre AS metodo_pago_nombre,
                 o.subtotal_est_max, o.subtotal_final,
                 o.descuento_total, o.envio_total, o.impuesto_total, o.gran_total,
                 o.tiene_peso_variable,
                 o.peso_max_total_kg, o.peso_real_total_kg,
                 o.codigo_descuento
           FROM ordenes o
           JOIN usuarios u ON u.id_usuario = o.id_usuario
      LEFT JOIN estados_orden eo ON eo.id_estado       = o.id_estado
      LEFT JOIN direcciones_usuario d ON d.id_direccion     = o.id_direccion
      LEFT JOIN tipos_entrega te ON te.id_tipo_entrega = o.tipo_entrega
      LEFT JOIN metodos_pago mp  ON mp.id_metodo_pago  = o.id_metodo_pago
          WHERE o.id_orden = $1`,
        [id]
      );

      const o = rOrden.rows[0];
      if (!o) return res.status(404).json({ error: 'Orden no encontrada' });

      const rItems = await pool.query(
        `SELECT  op.id_bolsa, op.cantidad, op.precio_unitario,
                 op.es_peso_variable,
                 op.precio_por_kg_aplicado,
                 op.pack_qty,
                 op.peso_max_total_kg,
                 op.peso_real_total_kg,
                 op.subtotal_estimado_max,
                 op.subtotal_final,
                 (CASE WHEN op.es_peso_variable THEN op.subtotal_final ELSE op.cantidad * op.precio_unitario END) AS subtotal,
                 b.descripcion_bolsa, b.ancho, b.alto
           FROM orden_productos op
           JOIN bolsas b ON b.id_bolsa = op.id_bolsa
          WHERE op.id_orden = $1
          ORDER BY b.descripcion_bolsa ASC`,
        [id]
      );

      const items = rItems.rows.map(r => ({
        id_bolsa: r.id_bolsa,
        descripcion_bolsa: r.descripcion_bolsa,
        dimensiones: { ancho: r.ancho, alto: r.alto },
        cantidad: Number(r.cantidad),

        precio_unitario: r.precio_unitario !== null ? Number(r.precio_unitario) : null,

        es_peso_variable: !!r.es_peso_variable,
        precio_por_kg_aplicado: r.precio_por_kg_aplicado !== null ? Number(r.precio_por_kg_aplicado) : null,
        pack_qty: r.pack_qty !== null ? Number(r.pack_qty) : null,

        peso_max_total_kg: r.peso_max_total_kg !== null ? Number(r.peso_max_total_kg) : null,
        peso_real_total_kg: r.peso_real_total_kg !== null ? Number(r.peso_real_total_kg) : null,

        subtotal_estimado_max: r.subtotal_estimado_max !== null ? Number(r.subtotal_estimado_max) : null,
        subtotal_final: r.subtotal_final !== null ? Number(r.subtotal_final) : null,

        subtotal: r.subtotal !== null ? Number(r.subtotal) : null,
      }));

      res.json({
        id_orden: o.id_orden,
        fecha: o.fecha,
        cliente: { id: o.id_usuario, correo: o.correo },
        estado: { id: o.id_estado, nombre: o.estado },
        totales: {
          subtotal_est_max: o.subtotal_est_max !== null ? Number(o.subtotal_est_max) : null,
          subtotal_final: o.subtotal_final !== null ? Number(o.subtotal_final) : null,
          descuento_total: Number(o.descuento_total || 0),
          envio_total: Number(o.envio_total || 0),
          impuesto_total: Number(o.impuesto_total || 0),
          gran_total: o.gran_total !== null ? Number(o.gran_total) : null,
        },
        flags: { tiene_peso_variable: !!o.tiene_peso_variable },
        pesos: {
          max_total_kg: o.peso_max_total_kg !== null ? Number(o.peso_max_total_kg) : null,
          real_total_kg: o.peso_real_total_kg !== null ? Number(o.peso_real_total_kg) : null,
        },
        descuento: { codigo: o.codigo_descuento || null },
        entrega: { id: o.tipo_entrega, nombre: o.tipo_entrega_nombre },
        pago: { id: o.id_metodo_pago, nombre: o.metodo_pago_nombre },
        direccion: {
          id: o.id_direccion,
          direccion_exacta: o.direccion_exacta,
          distrito: o.distrito,
          canton: o.canton,
          provincia: o.provincia,
          codigo_postal: o.codigo_postal,
        },
        items,
      });
    } catch (e) {
      console.error('[admin:orders:detail]', e);
      res.status(500).json({ error: 'No se pudo obtener el detalle de la orden' });
    }
  }
);

/* ========= PATCH ingresar peso real por item ========= */
router.patch(
  '/admin/orders/:id/items/:id_bolsa/weight',
  auth, isRole(ADMIN),
  setItemWeightValidator, validate,
  async (req, res) => {
    const id_orden = parseInt(req.params.id, 10);
    const id_bolsa = parseInt(req.params.id_bolsa, 10);
    const peso = Number(req.body.peso_real_total_kg);

    try {
      await pool.query('BEGIN');

      // 1) validar item y lock
      const { rows: chk } = await pool.query(
        `SELECT es_peso_variable, precio_por_kg_aplicado, peso_max_total_kg
           FROM orden_productos
          WHERE id_orden=$1 AND id_bolsa=$2
          FOR UPDATE`,
        [id_orden, id_bolsa]
      );

      if (!chk[0]) {
        await pool.query('ROLLBACK');
        return res.status(404).json({ error: 'Item no existe en la orden' });
      }
      if (!chk[0].es_peso_variable) {
        await pool.query('ROLLBACK');
        return res.status(400).json({ error: 'Este item no requiere pesaje' });
      }

      const precioKg = Number(chk[0].precio_por_kg_aplicado || 0);
      if (!precioKg) {
        await pool.query('ROLLBACK');
        return res.status(400).json({ error: 'Este item no tiene precio_por_kg_aplicado' });
      }

      const max = Number(chk[0].peso_max_total_kg || 0);
      if (max && peso > max) {
        await pool.query('ROLLBACK');
        return res.status(400).json({ error: `Peso real (${peso}) supera el máximo (${max})` });
      }

      // 2) subtotal final del item
      const subtotalFinal = Number((precioKg * peso).toFixed(2));

      // 3) actualizar item
      const { rows: updItem } = await pool.query(
        `UPDATE orden_productos
            SET peso_real_total_kg=$1,
                subtotal_final=$2
          WHERE id_orden=$3 AND id_bolsa=$4
        RETURNING id_orden, id_bolsa, peso_real_total_kg, subtotal_final`,
        [peso, subtotalFinal, id_orden, id_bolsa]
      );

      // 4) recalcular sumas de la orden
      const { rows: sums } = await pool.query(
        `
        SELECT
          COALESCE(SUM(
            CASE
              WHEN op.es_peso_variable THEN op.subtotal_final
              ELSE (op.cantidad * op.precio_unitario)
            END
          ),0)::numeric(12,2) AS subtotal_final_calc,

          COALESCE(SUM(
            CASE
              WHEN op.es_peso_variable THEN op.subtotal_estimado_max
              ELSE (op.cantidad * op.precio_unitario)
            END
          ),0)::numeric(12,2) AS subtotal_est_max_calc,

          COALESCE(SUM(op.peso_max_total_kg),0)::numeric(10,3) AS peso_max_total,
          COALESCE(SUM(op.peso_real_total_kg),0)::numeric(10,3) AS peso_real_total,

          SUM(CASE WHEN op.es_peso_variable AND op.peso_real_total_kg IS NULL THEN 1 ELSE 0 END)::int AS pendientes_pesaje
        FROM orden_productos op
        WHERE op.id_orden = $1
        `,
        [id_orden]
      );

      const subFinal = Number(sums[0].subtotal_final_calc);
      const subEstMax = Number(sums[0].subtotal_est_max_calc);
      const pesoMaxTot = Number(sums[0].peso_max_total);
      const pesoRealTot = Number(sums[0].peso_real_total);
      const pendientes = Number(sums[0].pendientes_pesaje);

      // 5) aplicar en ordenes y recalcular gran_total
      const { rows: ord } = await pool.query(
        `UPDATE ordenes
            SET subtotal_final = $1,
                subtotal_est_max = $2,
                peso_max_total_kg = $3,
                peso_real_total_kg = $4,
                gran_total = ROUND(($1 + COALESCE(envio_total,0) + COALESCE(impuesto_total,0) - COALESCE(descuento_total,0))::numeric, 2)
          WHERE id_orden = $5
        RETURNING id_orden, subtotal_final, subtotal_est_max, peso_max_total_kg, peso_real_total_kg, gran_total, id_estado`,
        [subFinal, subEstMax, pesoMaxTot, (pesoRealTot || null), id_orden]
      );

      // 6) opcional: si ya no hay pendientes, mover estado a "pendiente pago"
      if (ord[0]?.id_estado === EST_PEND_PESAJE && pendientes === 0) {
        await pool.query(
          `UPDATE ordenes SET id_estado=$1 WHERE id_orden=$2`,
          [EST_PEND_PAGO, id_orden]
        );
      }

      await pool.query('COMMIT');

      res.json({
        item: updItem[0],
        orden: ord[0],
        pendientes_pesaje: pendientes
      });
    } catch (e) {
      await pool.query('ROLLBACK');
      console.error('[admin:orders:weight]', e);
      res.status(500).json({ error: 'No se pudo guardar el peso' });
    }
  }
);

module.exports = router;
