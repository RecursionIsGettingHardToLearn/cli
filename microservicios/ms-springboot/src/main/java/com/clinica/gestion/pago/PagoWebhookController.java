package com.clinica.gestion.pago;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.stripe.exception.SignatureVerificationException;
import com.stripe.net.Webhook;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * Receptor del webhook de Stripe (REST plano, NO pasa por el gateway GraphQL).
 *
 * Autenticacion: la cabecera Stripe-Signature verificada contra
 * STRIPE_WEBHOOK_SECRET (la ruta esta permitAll en SecurityConfig porque
 * Stripe no tiene JWT de Supabase). Si el secret esta vacio, se acepta SIN
 * verificar SOLO para desarrollo local, con advertencia en el log.
 *
 * El payload se lee con Jackson (type / data.object.id / metadata.facturaId)
 * en lugar del deserializador tipado de Stripe, para ser tolerante a
 * diferencias de version de API entre la cuenta y la libreria.
 */
@RestController
@RequestMapping("/api/pagos")
@RequiredArgsConstructor
@Slf4j
public class PagoWebhookController {

    private final PagoService pagoService;
    private final StripeProperties props;
    private final ObjectMapper objectMapper;

    @PostMapping("/webhook")
    public ResponseEntity<Map<String, Object>> webhook(
            @RequestBody String payload,
            @RequestHeader(value = "Stripe-Signature", required = false) String firma) {

        String secret = props.getWebhookSecret();
        if (secret != null && !secret.isBlank()) {
            try {
                Webhook.constructEvent(payload, firma, secret);
            } catch (SignatureVerificationException e) {
                log.warn("[pagos] webhook con firma invalida: {}", e.getMessage());
                return ResponseEntity.badRequest().body(Map.of("error", "firma invalida"));
            }
        } else {
            log.warn("[pagos] STRIPE_WEBHOOK_SECRET vacio: webhook aceptado SIN verificar (solo desarrollo)");
        }

        try {
            JsonNode root = objectMapper.readTree(payload);
            String tipo = root.path("type").asText();
            JsonNode objeto = root.path("data").path("object");
            String sessionId = objeto.path("id").asText(null);
            String facturaId = objeto.path("metadata").path("facturaId").asText(null);
            pagoService.procesarEvento(tipo, sessionId, facturaId);
        } catch (Exception e) {
            log.error("[pagos] error procesando webhook: {}", e.getMessage());
            return ResponseEntity.internalServerError().body(Map.of("error", "procesamiento"));
        }
        return ResponseEntity.ok(Map.of("received", true));
    }
}
