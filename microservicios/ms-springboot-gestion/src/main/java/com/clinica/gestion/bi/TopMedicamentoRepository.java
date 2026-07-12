package com.clinica.gestion.bi;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface TopMedicamentoRepository extends JpaRepository<TopMedicamentoItem, UUID> {
}
