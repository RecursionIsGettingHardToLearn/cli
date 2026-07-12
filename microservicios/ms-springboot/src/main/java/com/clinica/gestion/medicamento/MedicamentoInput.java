package com.clinica.gestion.medicamento;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

import java.math.BigDecimal;

public record MedicamentoInput(
        @NotBlank String nombre,
        String descripcion,
        Integer categoriaId,
        @NotNull @PositiveOrZero BigDecimal precioVenta,
        Boolean requiereReceta,
        Boolean controlado,
        @PositiveOrZero Integer stockMinimo
) {}
