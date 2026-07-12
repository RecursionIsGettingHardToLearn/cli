package com.clinica.gestion.factura;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

public record FacturaInput(
        UUID pacienteId,
        @NotNull MetodoPago metodoPago,
        @PositiveOrZero BigDecimal descuento,
        Boolean pendiente,  // true => nace PENDIENTE para pagarse online (Stripe); null/false => PAGADA (caja)
        @NotEmpty @Valid List<ItemInput> items
) {
    public record ItemInput(
            @NotNull UUID medicamentoId,
            @NotNull @Positive Integer cantidad,
            UUID recetaId  // requerido si medicamento.requiereReceta = true
    ) {}
}
