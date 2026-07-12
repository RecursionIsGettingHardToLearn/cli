package com.clinica.gestion.receta;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.util.List;
import java.util.UUID;

public record RecetaInput(
        @NotNull UUID pacienteId,
        @NotBlank String medicoNombre,
        @NotBlank String medicoUid,
        String diagnostico,
        @NotEmpty @Valid List<DetalleInput> detalles
) {
    public record DetalleInput(
            @NotNull UUID medicamentoId,
            @NotNull @Positive Integer cantidad,
            String posologia
    ) {}
}
