const { validationResult } = require('express-validator');

module.exports = function validate(req, res, next) {
  const errors = validationResult(req);
  if (errors.isEmpty()) return next();

  // Respuesta uniforme
  return res.status(400).json({
    errors: errors.array().map(e => ({
      msg: e.msg,
      param: e.param,
      location: e.location
    }))
  });
};
