package com.clinica.gestion.bi;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.time.LocalDate;
import java.util.List;

public interface RecetaBlockchainRepository extends JpaRepository<RecetaBlockchainPoint, LocalDate> {
    @Query("select r from RecetaBlockchainPoint r " +
            "where (:desde is null or r.mes >= :desde) and (:hasta is null or r.mes <= :hasta) " +
            "order by r.mes desc")
    List<RecetaBlockchainPoint> findRange(LocalDate desde, LocalDate hasta);
}
