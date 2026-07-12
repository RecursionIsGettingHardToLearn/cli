package com.clinica.gestion.receta;

import com.clinica.gestion.medicamento.Medicamento;
import jakarta.persistence.*;
import lombok.*;

import java.util.UUID;

@Entity
@Table(name = "detalle_receta")
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class DetalleReceta {

    @Id
    @GeneratedValue
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "receta_id", nullable = false)
    private Receta receta;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "medicamento_id", nullable = false)
    private Medicamento medicamento;

    @Column(nullable = false)
    private Integer cantidad;

    @Column(length = 250)
    private String posologia;
}
