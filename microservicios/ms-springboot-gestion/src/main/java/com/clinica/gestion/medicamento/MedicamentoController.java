package com.clinica.gestion.medicamento;

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
public class MedicamentoController {

    private final MedicamentoService medicamentoService;

    @QueryMapping
    public List<Medicamento> medicamentos(@Argument String q, @Argument Boolean activo) {
        return medicamentoService.listar(q, activo);
    }

    @QueryMapping
    public Medicamento medicamento(@Argument UUID id) {
        return medicamentoService.findById(id);
    }

    @MutationMapping
    @PreAuthorize("hasAnyRole('ADMINISTRADOR','FARMACEUTICO')")
    public Medicamento crearMedicamento(@Argument @Valid MedicamentoInput input) {
        return medicamentoService.crear(input);
    }

    @MutationMapping
    @PreAuthorize("hasAnyRole('ADMINISTRADOR','FARMACEUTICO')")
    public Medicamento actualizarMedicamento(@Argument UUID id, @Argument @Valid MedicamentoInput input) {
        return medicamentoService.actualizar(id, input);
    }

    @MutationMapping
    @PreAuthorize("hasRole('ADMINISTRADOR')")
    public Medicamento desactivarMedicamento(@Argument UUID id) {
        return medicamentoService.desactivar(id);
    }
}
