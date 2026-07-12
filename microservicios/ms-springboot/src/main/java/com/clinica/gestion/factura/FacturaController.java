package com.clinica.gestion.factura;

import com.clinica.gestion.common.client.PacienteClient;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.graphql.data.method.annotation.Argument;
import org.springframework.graphql.data.method.annotation.MutationMapping;
import org.springframework.graphql.data.method.annotation.QueryMapping;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Controller;

import java.util.Collections;
import java.util.List;
import java.util.UUID;

@Controller
@RequiredArgsConstructor
public class FacturaController {

    private final FacturaService facturaService;
    private final PacienteClient pacienteClient;

    @QueryMapping
    @PreAuthorize("hasAnyRole('ADMINISTRADOR','FARMACEUTICO')")
    public List<Factura> facturas() {
        return facturaService.listar();
    }

    @QueryMapping
    @PreAuthorize("hasAnyRole('ADMINISTRADOR','FARMACEUTICO')")
    public Factura factura(@Argument UUID id) {
        return facturaService.findById(id);
    }

    @QueryMapping
    @PreAuthorize("hasRole('PACIENTE')")
    public List<Factura> misFacturas() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (!(auth instanceof JwtAuthenticationToken jwt)) {
            throw new AccessDeniedException("Usuario no autenticado");
        }
        String uid = jwt.getToken().getSubject();
        return pacienteClient.pacienteIdPorSupabaseUid(uid)
                .map(facturaService::listarPorPaciente)
                .orElse(Collections.emptyList());
    }

    @MutationMapping
    @PreAuthorize("hasAnyRole('ADMINISTRADOR','FARMACEUTICO')")
    public Factura crearFactura(@Argument @Valid FacturaInput input) {
        return facturaService.crear(input);
    }

    @MutationMapping
    @PreAuthorize("hasAnyRole('ADMINISTRADOR','FARMACEUTICO')")
    public Factura anularFactura(@Argument UUID id, @Argument String motivo) {
        return facturaService.anular(id, motivo);
    }
}
