package com.clinica.gestion.receta;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface RecetaRepository extends JpaRepository<Receta, UUID> {
    List<Receta> findByPacienteIdOrderByFechaEmisionDesc(UUID pacienteId);
    List<Receta> findByMedicoUidOrderByFechaEmisionDesc(String medicoUid);
    List<Receta> findByControladoTrueAndBlockchainTxIsNull();
    // Una receta esta verdaderamente pendiente solo si NO tiene id on-chain.
    // (puede tener blockchainId sin txHash si fue registrada de forma idempotente)
    List<Receta> findByControladoTrueAndBlockchainIdIsNull();
}
