package com.clinica.gestion.pago;

import lombok.RequiredArgsConstructor;
import org.springframework.graphql.data.method.annotation.Argument;
import org.springframework.graphql.data.method.annotation.MutationMapping;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Controller;

import java.util.UUID;

/**
 * Mutation federada (subgrafo MS3): el movil y Angular la consumen via gateway.
 * Devuelve la URL de la pagina de pago alojada por Stripe.
 */
@Controller
@RequiredArgsConstructor
public class PagoController {

    private final PagoService pagoService;

    @MutationMapping
    @PreAuthorize("hasAnyRole('PACIENTE','ADMINISTRADOR')")
    public String crearCheckoutFactura(@Argument UUID facturaId) {
        return pagoService.crearCheckout(facturaId);
    }
}
