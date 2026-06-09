const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');

const jwksUri = process.env.SUPABASE_JWKS_URI;
const enabled = Boolean(jwksUri);

let client = null;
if (enabled) {
  client = jwksClient({
    jwksUri,
    cache: true,
    cacheMaxAge: 60 * 60 * 1000  // 1 hora
  });
}

function getKey(header, callback) {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    callback(null, key.getPublicKey());
  });
}

/**
 * Verifica JWT de Supabase usando JWKS asimetrico (RS256/ES256).
 * Si JWKS no esta configurado, pasa derecho con req.user = null (modo dev).
 */
function authMiddleware(opciones = {}) {
  const { roles } = opciones;

  return (req, res, next) => {
    if (!enabled) {
      req.user = null;
      return next();
    }
    const authHeader = req.headers.authorization || '';
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Falta header Authorization Bearer' });
    }
    const token = authHeader.slice(7);

    jwt.verify(token, getKey, { algorithms: ['RS256', 'ES256'] }, (err, decoded) => {
      if (err) {
        console.warn('JWT invalido:', err.message);
        return res.status(401).json({ error: 'Token invalido' });
      }
      const role = (decoded.app_metadata && decoded.app_metadata.role)
        || (decoded.user_metadata && decoded.user_metadata.role)
        || 'PACIENTE';
      req.user = {
        sub: decoded.sub,
        email: decoded.email,
        role
      };
      if (roles && roles.length > 0 && !roles.includes(role)) {
        return res.status(403).json({ error: `Rol ${role} no autorizado` });
      }
      next();
    });
  };
}

module.exports = authMiddleware;
