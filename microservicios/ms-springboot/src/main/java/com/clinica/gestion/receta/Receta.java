package com.clinica.gestion.receta;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.springframework.data.annotation.CreatedDate;
import org.springframework.data.annotation.LastModifiedDate;
import org.springframework.data.jpa.domain.support.AuditingEntityListener;
import org.hibernate.type.SqlTypes;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "receta")
@EntityListeners(AuditingEntityListener.class)
@Getter @Setter @NoArgsConstructor @AllArgsConstructor @Builder
public class Receta {

    @Id
    @GeneratedValue
    private UUID id;

    // Referencia a paciente en MS1 (sin FK). El dueño canonico del paciente es MS1.
    @Column(name = "paciente_id", nullable = false)
    private UUID pacienteId;

    @Column(name = "medico_nombre", nullable = false, length = 150)
    private String medicoNombre;

    @Column(name = "medico_uid", nullable = false, length = 100)
    private String medicoUid;

    @Column(columnDefinition = "TEXT")
    private String diagnostico;

    @Column(name = "fecha_emision", nullable = false)
    @Builder.Default
    private OffsetDateTime fechaEmision = OffsetDateTime.now();

    @Column(nullable = false)
    @Builder.Default
    private Boolean controlado = false;

    @Column(name = "hash_documento", length = 80)
    private String hashDocumento;

    @Column(name = "blockchain_tx", length = 100)
    private String blockchainTx;

    @Column(name = "blockchain_id")
    private Long blockchainId;

    @Enumerated(EnumType.STRING)
    @JdbcTypeCode(SqlTypes.NAMED_ENUM)
    @Column(name = "estado", nullable = false)
    @Builder.Default
    private EstadoReceta estado = EstadoReceta.EMITIDA;

    @OneToMany(mappedBy = "receta", cascade = CascadeType.ALL, orphanRemoval = true)
    @Builder.Default
    private List<DetalleReceta> detalles = new ArrayList<>();

    @CreatedDate
    @Column(name = "created_at", updatable = false)
    private OffsetDateTime createdAt;

    @LastModifiedDate
    @Column(name = "updated_at")
    private OffsetDateTime updatedAt;
}
