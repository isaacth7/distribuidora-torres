const { body, param, query } = require('express-validator');

const idParam = [ param('id').isInt({ min:1 }).withMessage('id inválido') ];
const subtipoParam = [ param('id_subtipo').isInt({ min:1 }).withMessage('id_subtipo inválido') ];

const listBySubtipoValidator = [
  ...subtipoParam,
  query('page').optional().isInt({ min:1 }).withMessage('page inválido'),
  query('pageSize').optional().isInt({ min:1, max:100 }).withMessage('pageSize inválido')
];

const createImageValidator = [
  ...subtipoParam,
  body('url_imagen')
    .exists().withMessage('url_imagen es requerida')
    .bail()
    .isURL({ require_protocol: true }).withMessage('url_imagen debe ser URL válida (con http/https)'),
  body('descripcion').optional({ nullable:true }).isString().trim().isLength({ max:255 }).withMessage('descripcion muy larga'),
  body('orden').optional().isInt({ min:1 }).withMessage('orden debe ser entero >= 1')
];

const updateImageValidator = [
  ...idParam,
  body('url_imagen').optional().isURL({ require_protocol: true }).withMessage('url_imagen inválida'),
  body('descripcion').optional({ nullable:true }).isString().trim().isLength({ max:255 }).withMessage('descripcion muy larga'),
  body('orden').optional().isInt({ min:1 }).withMessage('orden debe ser entero >= 1')
];

module.exports = {
  listBySubtipoValidator,
  createImageValidator,
  updateImageValidator,
  idParam,
  subtipoParam
};
