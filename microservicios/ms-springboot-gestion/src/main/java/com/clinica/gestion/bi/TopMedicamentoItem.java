package com.clinica.gestion.bi;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.Immutable;

import java.math.BigDecimal;
import java.util.UUID;

@Entity
@Immutable
@Table(name = "vw_top_medicamentos")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor
public class TopMedicamentoItem {

    @Id
    @Column(name = "medicamento_id")
    private UUID medicamentoId;

    private String medicamento;

    @Column(name = "unidades_vendidas")
    private Long unidadesVendidas;

    @Column(name = "monto_total")
    private BigDecimal montoTotal;

    @Column(name = "num_facturas")
    private Long numFacturas;
}
