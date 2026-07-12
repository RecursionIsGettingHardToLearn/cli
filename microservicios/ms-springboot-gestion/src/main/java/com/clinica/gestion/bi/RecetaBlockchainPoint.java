package com.clinica.gestion.bi;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.Immutable;

import java.time.LocalDate;

@Entity
@Immutable
@Table(name = "vw_recetas_blockchain")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor
public class RecetaBlockchainPoint {

    @Id
    private LocalDate mes;

    @Column(name = "total_recetas")
    private Long totalRecetas;

    @Column(name = "registradas_en_blockchain")
    private Long registradasEnBlockchain;

    private Long controladas;

    private Long dispensadas;
}
