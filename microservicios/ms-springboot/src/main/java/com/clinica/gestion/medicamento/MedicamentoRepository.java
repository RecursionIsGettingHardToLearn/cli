package com.clinica.gestion.medicamento;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.UUID;

public interface MedicamentoRepository extends JpaRepository<Medicamento, UUID> {

    @Query(value = "select * from medicamento m where (:activo is null or m.activo = :activo) " +
            "and (cast(:q as text) is null or lower(m.nombre) like lower(concat('%', cast(:q as text), '%')))",
            nativeQuery = true)
    List<Medicamento> buscar(String q, Boolean activo);
}
