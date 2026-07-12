package com.clinica.gestion.inventario;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

public record LoteInput(
        @NotNull UUID medicamentoId,
        UUID proveedorId,
        @NotBlank String codigoLote,
        @NotNull LocalDate fechaVencimiento,
        @NotNull @Positive Integer cantidad,
        @NotNull @PositiveOrZero BigDecimal precioCompra
) {}
