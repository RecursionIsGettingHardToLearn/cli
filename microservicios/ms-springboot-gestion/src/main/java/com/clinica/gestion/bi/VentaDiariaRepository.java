package com.clinica.gestion.bi;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.time.LocalDate;
import java.util.List;

public interface VentaDiariaRepository extends JpaRepository<VentaDiariaPoint, LocalDate> {
    @Query("select v from VentaDiariaPoint v " +
            "where (:desde is null or v.dia >= :desde) and (:hasta is null or v.dia <= :hasta) " +
            "order by v.dia desc")
    List<VentaDiariaPoint> findRange(LocalDate desde, LocalDate hasta);
}
