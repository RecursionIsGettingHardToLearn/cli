package com.clinica.gestion.factura;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface FacturaRepository extends JpaRepository<Factura, UUID> {
    List<Factura> findByPacienteIdOrderByFechaDesc(UUID pacienteId);
    boolean existsByNumero(String numero);
    long count();
}
