package com.clinica.gestion.inventario;

import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.graphql.data.method.annotation.Argument;
import org.springframework.graphql.data.method.annotation.MutationMapping;
import org.springframework.graphql.data.method.annotation.QueryMapping;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Controller;

import java.util.List;
import java.util.UUID;

@Controller
@RequiredArgsConstructor
public class InventarioController {

    private final InventarioService inventarioService;

    @QueryMapping
    @PreAuthorize("hasAnyRole('ADMINISTRADOR','FARMACEUTICO','MEDICO')")
    public List<Lote> lotesByMedicamento(@Argument UUID medicamentoId) {
        return inventarioService.lotesByMedicamento(medicamentoId);
    }

    @QueryMapping
    @PreAuthorize("hasAnyRole('ADMINISTRADOR','FARMACEUTICO')")
    public List<MovimientoInventario> movimientosByLote(@Argument UUID loteId) {
        return inventarioService.movimientosByLote(loteId);
    }

    @MutationMapping
    @PreAuthorize("hasAnyRole('ADMINISTRADOR','FARMACEUTICO')")
    public Lote registrarEntradaLote(@Argument @Valid LoteInput input) {
        return inventarioService.registrarEntradaLote(input);
    }

    @MutationMapping
    @PreAuthorize("hasAnyRole('ADMINISTRADOR','FARMACEUTICO')")
    public MovimientoInventario ajustarStock(@Argument UUID loteId, @Argument Integer cantidad, @Argument String motivo) {
        return inventarioService.ajustarStock(loteId, cantidad, motivo);
    }
}
