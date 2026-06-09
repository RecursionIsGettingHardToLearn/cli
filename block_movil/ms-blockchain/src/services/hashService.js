const crypto = require('crypto');

/**
 * SHA-256 hex de un string UTF-8.
 */
function sha256Hex(input) {
  return crypto.createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * Convierte un string arbitrario a bytes32:
 *   - si parece hex de 32 bytes (64 chars), lo usa tal cual
 *   - si no, hace keccak256 del string para empacarlo
 */
function toBytes32(input, ethers) {
  if (!input) return ethers.ZeroHash;
  const s = String(input).trim();
  // 0x + 64 hex chars
  if (/^0x[0-9a-fA-F]{64}$/.test(s)) return s;
  // hex de 64 sin prefijo
  if (/^[0-9a-fA-F]{64}$/.test(s)) return '0x' + s;
  // si no, hash del string para empacarlo de forma determinista
  return ethers.id(s);
}

module.exports = { sha256Hex, toBytes32 };
