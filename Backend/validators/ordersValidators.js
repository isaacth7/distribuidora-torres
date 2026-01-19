const { body, param } = require('express-validator');
const { pool } = require('../config/db');

const existsById = (table, column = 'id') => {
  return async (value) => {
    const { rowCount } = await pool.query(`SELECT 1 FROM ${table} WHERE ${column} = $1`, [value]);
    if (!rowCount) throw new Error(`${table}.${column} no existe`);
    return true;
  };
};

const checkoutValidator = [
  body('id_direccion')
    .exists().withMessage('id_direccion es requerido')
    .bail()
    .isInt({ min: 1 }).withMessage('id_direccion inválido'),
  body('id_metodo_pago')
    .exists().withMessage('id_metodo_pago es requerido')
    .bail()
    .isInt({ min: 1 }).withMessage('id_metodo_pago inválido')
    .bail()
    .custom(existsById('metodos_pago', 'id_metodo_pago')),
  body('id_tipo_entrega')
    .exists().withMessage('id_tipo_entrega es requerido')
    .bail()
    .isInt({ min: 1 }).withMessage('id_tipo_entrega inválido')
    .bail()
    .custom(existsById('tipos_entrega', 'id_tipo_entrega'))
];

const orderIdParam = [
  param('id').isInt({ min: 1 }).withMessage('id inválido')
];

module.exports = { checkoutValidator, orderIdParam };
