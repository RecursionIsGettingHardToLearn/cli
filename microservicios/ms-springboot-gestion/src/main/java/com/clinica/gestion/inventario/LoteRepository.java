package com.clinica.gestion.inventario;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.UUID;

public interface LoteRepository extends JpaRepository<Lote, UUID> {

    @Query("select l from Lote l where l.medicamento.id = :medId and l.cantidadActual > 0 " +
            "order by l.fechaVencimiento asc")
    List<Lote> findDisponiblesFIFO(UUID medId);

    @Query("select l from Lote l where l.medicamento.id = :medId order by l.fechaVencimiento asc")
    List<Lote> findByMedicamento(UUID medId);
}
