const { body, param } = require('express-validator');

const createAddressValidator = [
  body('direccion_exacta')
    .exists().withMessage('direccion_exacta es requerida')
    .bail()
    .trim().isLength({ min: 5 }).withMessage('direccion_exacta muy corta'),
  body('provincia').exists().withMessage('provincia es requerida').bail().trim(),
  body('canton').exists().withMessage('canton es requerido').bail().trim(),
  body('distrito').exists().withMessage('distrito es requerido').bail().trim(),
  body('codigo_postal').optional({ nullable: true }).isInt({ min: 0 }).withMessage('codigo_postal inválido'),
  body('activa').optional().isBoolean().withMessage('activa debe ser boolean')
];

const updateAddressValidator = [
  param('id').isInt({ min: 1 }).withMessage('id inválido'),
  body('direccion_exacta').optional().trim().isLength({ min: 5 }).withMessage('direccion_exacta muy corta'),
  body('provincia').optional().trim(),
  body('canton').optional().trim(),
  body('distrito').optional().trim(),
  body('codigo_postal').optional({ nullable: true }).isInt({ min: 0 }).withMessage('codigo_postal inválido'),
  body('activa').optional().isBoolean().withMessage('activa debe ser boolean')
];

const activarAddressValidator = [
  param('id').isInt({ min: 1 }).withMessage('id inválido'),
  body('activa').exists().withMessage('activa es requerida').bail().isBoolean().withMessage('activa debe ser boolean')
];

module.exports = { createAddressValidator, updateAddressValidator, activarAddressValidator };
