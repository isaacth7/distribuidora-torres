const { body } = require('express-validator');

const sanitizeEmail = () =>
  body('correo')
    .exists().withMessage('correo es requerido')
    .bail()
    .trim()
    .toLowerCase()
    .isEmail().withMessage('correo inválido');

const registerValidator = [
  sanitizeEmail(),
  body('contrasena')
    .exists().withMessage('contrasena es requerida')
    .bail()
    .isLength({ min: 8 }).withMessage('contrasena debe tener al menos 8 caracteres'),
  body('id_rol_usuario')
    .optional()
    .isInt({ min: 1 }).withMessage('id_rol_usuario debe ser entero positivo'),
  body('nombre').optional().trim().isLength({ max: 100 }).withMessage('nombre muy largo'),
  body('primer_apellido').optional().trim().isLength({ max: 100 }).withMessage('primer_apellido muy largo'),
  body('segundo_apellido').optional().trim().isLength({ max: 100 }).withMessage('segundo_apellido muy largo')
];

const loginValidator = [
  sanitizeEmail(),
  body('contrasena')
    .exists().withMessage('contrasena es requerida')
];

const forgotPasswordValidator = [
  body('correo')
    .exists().withMessage('correo es requerido')
    .bail()
    .trim()
    .toLowerCase()
    .isEmail().withMessage('correo inválido')
];

const resetPasswordValidator = [
  body('token')
    .exists().withMessage('token es requerido')
    .bail()
    .isString().notEmpty(),
  body('contrasena')
    .exists().withMessage('contrasena es requerida')
    .bail()
    .isLength({ min: 8 }).withMessage('contrasena debe tener al menos 8 caracteres')
];

module.exports = { registerValidator, loginValidator };


module.exports = {
  registerValidator,
  loginValidator,
  forgotPasswordValidator,
  resetPasswordValidator
};
