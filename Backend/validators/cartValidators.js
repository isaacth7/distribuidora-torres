const { body, param } = require('express-validator');

const addItemValidator = [
  body('id_bolsa').exists().withMessage('id_bolsa requerido')
    .bail().isFloat({ min:0.25 }).withMessage('id_bolsa inválido'),
  body('cantidad').exists().withMessage('cantidad requerida')
    .bail().isFloat({ min:0.25 }).withMessage('cantidad debe ser >= 1')
];

const setQtyValidator = [
  param('id_bolsa').isFloat({ min:0.25 }).withMessage('id_bolsa inválido'),
  body('cantidad').exists().withMessage('cantidad requerida')
    .bail().isFloat({ min:0.25 }).withMessage('cantidad debe ser >= 1')
];

const idBolsaParam = [
  param('id_bolsa').isInt({ min:1 }).withMessage('id_bolsa inválido')
];

module.exports = { addItemValidator, setQtyValidator, idBolsaParam };
