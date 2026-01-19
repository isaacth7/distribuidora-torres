const { body, param } = require('express-validator');
const { pool } = require('../config/db');

const updateOrderStatusValidator = [
  param('id').isInt({ min: 1 }).withMessage('id inválido'),
  body('id_estado')
    .exists().withMessage('id_estado es requerido')
    .bail()
    .isInt({ min: 1 }).withMessage('id_estado inválido')
    .bail()
    .custom(async (value) => {
      const { rowCount } = await pool.query('SELECT 1 FROM estados_orden WHERE id_estado=$1', [value]);
      if (!rowCount) throw new Error('id_estado no existe');
      return true;
    })
];

module.exports = { updateOrderStatusValidator };
