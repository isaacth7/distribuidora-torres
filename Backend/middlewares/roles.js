// middlewares/roles.js
module.exports.isRole = (...rolesPermitidos) => {
  const set = new Set(rolesPermitidos.map(r => String(r).toLowerCase()));
  return (req, res, next) => {
    const rol = req.user?.rol;
    if (!rol) return res.status(401).json({ error: 'No autenticado' });
    if (!set.has(String(rol).toLowerCase())) {
      return res.status(403).json({ error: 'No autorizado' });
    }
    next();
  };
};
