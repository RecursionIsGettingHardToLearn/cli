package com.clinica.gestion.bi;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.Immutable;

import java.util.UUID;

@Entity
@Immutable
@Table(name = "vw_inventario_critico")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor
public class InventarioCriticoItem {

    @Id
    @Column(name = "medicamento_id")
    private UUID medicamentoId;

    private String medicamento;

    @Column(name = "stock_minimo")
    private Integer stockMinimo;

    @Column(name = "stock_actual")
    private Long stockActual;

    private String nivel;  // OK, BAJO, CRITICO, SIN_STOCK
}
