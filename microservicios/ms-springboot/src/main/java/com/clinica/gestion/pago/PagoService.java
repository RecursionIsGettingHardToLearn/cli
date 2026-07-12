package com.clinica.gestion.pago;

import com.clinica.gestion.common.client.PacienteClient;
import com.clinica.gestion.common.exception.BusinessException;
import com.clinica.gestion.factura.EstadoFactura;
import com.clinica.gestion.factura.Factura;
import com.clinica.gestion.factura.FacturaService;
import com.stripe.Stripe;
import com.stripe.exception.StripeException;
import com.stripe.model.checkout.Session;
import com.stripe.param.checkout.SessionCreateParams;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Service;

import java.util.UUID;

/**
 * Pagos online con Stripe Checkout (pagina alojada por Stripe).
 *
 * Flujo: crearCheckout() valida estado PENDIENTE y propiedad de la factura,
 * arma la sesion con el monto LEIDO DE LA BD (nunca del cliente) y devuelve la
 * URL de pago. Stripe confirma por webhook -> procesarEvento() marca PAGADA
 * (idempotente). La caja presencial (facturas que nacen PAGADA) no se toca.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class PagoService {

    private final StripeProperties props;
    private final FacturaService facturaService;
    private final PacienteClient pacienteClient;

    /** Crea la Checkout Session y devuelve la URL de pago de Stripe. */
    public String crearCheckout(UUID facturaId) {
        if (props.getSecretKey() == null || props.getSecretKey().isBlank()) {
            throw new BusinessException(
                    "Pagos online no configurados (falta STRIPE_SECRET_KEY en MS3)");
        }

        Factura f = facturaService.findById(facturaId);
        if (f.getEstado() != EstadoFactura.PENDIENTE) {
            throw new BusinessException(
                    "Solo se pueden pagar facturas PENDIENTE (estado actual: " + f.getEstado() + ")");
        }
        validarPropiedad(f);

        Stripe.apiKey = props.getSecretKey();
        long montoCentavos = f.getTotal().movePointRight(2).longValueExact();

        SessionCreateParams params = SessionCreateParams.builder()
                .setMode(SessionCreateParams.Mode.PAYMENT)
                .setSuccessUrl(props.getSuccessUrl())
                .setCancelUrl(props.getCancelUrl())
                .putMetadata("facturaId", f.getId().toString())
                .addLineItem(SessionCreateParams.LineItem.builder()
                        .setQuantity(1L)
                        .setPriceData(SessionCreateParams.LineItem.PriceData.builder()
                                .setCurrency(props.getCurrency())
                                .setUnitAmount(montoCentavos)
                                .setProductData(SessionCreateParams.LineItem.PriceData
                                        .ProductData.builder()
                                        .setName("Factura " + f.getNumero() + " - Clinica")
                                        .setDescription("Pago de medicamentos (" 
                                                + f.getDetalles().size() + " item(s))")
                                        .build())
                                .build())
                        .build())
                .build();

        try {
            Session session = Session.create(params);
            facturaService.vincularStripeSession(f.getId(), session.getId());
            log.info("[pagos] checkout creado factura={} session={}", f.getNumero(), session.getId());
            return session.getUrl();
        } catch (StripeException e) {
            log.error("[pagos] error creando checkout para factura {}: {}", f.getNumero(), e.getMessage());
            throw new BusinessException("No se pudo iniciar el pago: " + e.getMessage());
        }
    }

    /**
     * PACIENTE solo puede pagar SUS facturas (uid del JWT -> pacienteId via MS1).
     * ADMINISTRADOR puede generar el link de cualquier factura (caja asistida).
     */
    private void validarPropiedad(Factura f) {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        boolean esPaciente = auth != null && auth.getAuthorities().stream()
                .anyMatch(a -> "ROLE_PACIENTE".equals(a.getAuthority()));
        if (!esPaciente) {
            return;
        }
        if (!(auth instanceof JwtAuthenticationToken jwt)) {
            throw new AccessDeniedException("Usuario no autenticado");
        }
        UUID pacienteDelJwt = pacienteClient.pacienteIdPorSupabaseUid(jwt.getToken().getSubject())
                .orElseThrow(() -> new BusinessException(
                        "No se pudo verificar tu registro de paciente (MS1 no responde)"));
        if (f.getPacienteId() == null || !f.getPacienteId().equals(pacienteDelJwt)) {
            throw new AccessDeniedException("La factura no pertenece a este paciente");
        }
    }

    /** Procesa un evento ya autenticado del webhook. Ignora tipos no relevantes. */
    public void procesarEvento(String tipo, String sessionId, String facturaIdMetadata) {
        if (!"checkout.session.completed".equals(tipo)) {
            log.debug("[pagos] evento ignorado: {}", tipo);
            return;
        }
        if (facturaIdMetadata == null || facturaIdMetadata.isBlank()) {
            log.warn("[pagos] checkout.session.completed sin metadata.facturaId (session={})", sessionId);
            return;
        }
        Factura f = facturaService.marcarPagada(UUID.fromString(facturaIdMetadata), sessionId);
        log.info("[pagos] factura {} marcada PAGADA via Stripe (session={})", f.getNumero(), sessionId);
    }
}
