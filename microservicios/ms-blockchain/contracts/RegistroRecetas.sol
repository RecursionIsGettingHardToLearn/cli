// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title RegistroRecetas
 * @notice Registro inmutable de recetas medicas. Almacena el SHA-256 del documento
 * canonico junto con identificadores de paciente y medico, y un timestamp.
 *
 * El contrato no almacena datos clinicos. Solo se usa para verificar integridad.
 */
contract RegistroRecetas {

    struct Registro {
        bytes32 hashDocumento;   // SHA-256 del documento canonico
        bytes32 pacienteId;      // identificador del paciente (UUID empacado)
        bytes32 medicoUid;       // supabase_uid del medico
        uint64  timestamp;       // block.timestamp en segundos
        address registrador;     // wallet que invoco la transaccion
    }

    Registro[] public registros;
    mapping(bytes32 => uint256[]) private porPaciente;  // pacienteId -> indices
    mapping(bytes32 => uint256)   private porHash;      // hash -> index+1 (0 = inexistente)

    event RecetaRegistrada(
        uint256 indexed id,
        bytes32 indexed hashDoc,
        bytes32 indexed pacienteId,
        uint64  timestamp
    );

    /**
     * Registra un nuevo hash. Revierte si el hash ya existe (anti-duplicacion).
     * @return id Indice del registro en el array registros.
     */
    function registrar(bytes32 hashDoc, bytes32 pacienteId, bytes32 medicoUid)
        external
        returns (uint256 id)
    {
        require(hashDoc != bytes32(0), "Hash vacio");
        require(porHash[hashDoc] == 0, "Hash ya registrado");

        registros.push(Registro({
            hashDocumento: hashDoc,
            pacienteId: pacienteId,
            medicoUid: medicoUid,
            timestamp: uint64(block.timestamp),
            registrador: msg.sender
        }));

        id = registros.length - 1;
        porPaciente[pacienteId].push(id);
        porHash[hashDoc] = id + 1;

        emit RecetaRegistrada(id, hashDoc, pacienteId, uint64(block.timestamp));
    }

    /**
     * Verifica si un hash existe en el registro.
     */
    function verificar(bytes32 hashDoc)
        external
        view
        returns (bool exists, uint256 id, uint64 timestamp)
    {
        uint256 idx = porHash[hashDoc];
        if (idx == 0) return (false, 0, 0);
        Registro storage r = registros[idx - 1];
        return (true, idx - 1, r.timestamp);
    }

    /**
     * Devuelve los indices de registros de un paciente.
     */
    function recetasDe(bytes32 pacienteId) external view returns (uint256[] memory) {
        return porPaciente[pacienteId];
    }

    function total() external view returns (uint256) {
        return registros.length;
    }
}
