/**
 * ABI de SOLO LECTURA del contrato RegistroRecetas desplegado en Polygon Amoy.
 *
 * El movil nunca escribe en la cadena (eso lo hace el backend con la PRIVATE_KEY
 * del servicio); por eso aqui solo incluimos las funciones `view` y el evento.
 * Mantener este ABI alineado con `ms-blockchain/contracts/RegistroRecetas.sol`.
 */
export const REGISTRO_RECETAS_ABI = [
  // verificar(bytes32) -> (bool exists, uint256 id, uint64 timestamp)
  'function verificar(bytes32 hashDoc) view returns (bool exists, uint256 id, uint64 timestamp)',
  // recetasDe(bytes32 pacienteId) -> uint256[]
  'function recetasDe(bytes32 pacienteId) view returns (uint256[])',
  // total() -> uint256
  'function total() view returns (uint256)',
  // evento emitido al registrar
  'event RecetaRegistrada(uint256 indexed id, bytes32 indexed hashDoc, bytes32 indexed pacienteId, uint64 timestamp)',
] as const;
