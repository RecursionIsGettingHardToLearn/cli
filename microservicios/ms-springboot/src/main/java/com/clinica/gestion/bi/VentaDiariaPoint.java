package com.clinica.gestion.bi;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.Immutable;

import java.math.BigDecimal;
import java.time.LocalDate;

@Entity
@Immutable
@Table(name = "vw_ventas_diarias")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor
public class VentaDiariaPoint {

    @Id
    private LocalDate dia;

    @Column(name = "num_facturas")
    private Long numFacturas;

    @Column(name = "total_vendido")
    private BigDecimal totalVendido;

    @Column(name = "ticket_promedio")
    private BigDecimal ticketPromedio;
}
