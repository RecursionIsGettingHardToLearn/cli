// =====================================================
//  errorDetails — serializa un error COMPLETO para exponerlo al cliente.
//  Incluye mensaje, nombre, stack, causa anidada y los campos tipicos de
//  ethers.js / nodos RPC (code, shortMessage, reason, info, data...).
//  Objetivo: que cualquier error backend se muestre explicito y completo,
//  sin enmascararlo con un mensaje generico.
// =====================================================
function errorDetails(e) {
  if (e == null) return { error: 'Error desconocido (valor nulo)' };
  if (typeof e !== 'object') return { error: String(e) };

  const details = {
    error: e.message || String(e),
    name: e.name,
    stack: e.stack,
  };

  // Campos extra tipicos de ethers.js / axios / RPC: los exponemos si existen.
  for (const k of ['code', 'shortMessage', 'reason', 'info', 'data', 'errorName', 'errorArgs', 'status', 'statusCode']) {
    if (e[k] !== undefined) details[k] = e[k];
  }

  // Causa anidada (Error.cause): la serializamos recursivamente.
  if (e.cause && e.cause !== e) {
    details.cause = errorDetails(e.cause);
  }

  return details;
}

module.exports = { errorDetails };
