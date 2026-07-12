package com.clinica.gestion.receta;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;

import java.time.Duration;
import java.util.Map;

@Slf4j
@Component
public class BlockchainClient {

    private final WebClient webClient;
    private final boolean enabled;
    private final Duration timeout;

    public BlockchainClient(
            @Qualifier("blockchainWebClient") WebClient webClient,
            @Value("${app.blockchain.enabled}") boolean enabled,
            @Value("${app.blockchain.timeout-seconds}") int timeoutSeconds) {
        this.webClient = webClient;
        this.enabled = enabled;
        this.timeout = Duration.ofSeconds(timeoutSeconds);
    }

    /**
     * Llama POST /recetas en ms-blockchain. Devuelve null si esta deshabilitado o falla.
     * No relanza excepciones: el caller debe decidir como reaccionar a un null.
     */
    public RegistroBlockchain registrarReceta(String documentoCanonico, String pacienteId, String medicoUid) {
        if (!enabled) {
            log.info("Blockchain deshabilitado por config — skip registrarReceta");
            return null;
        }
        try {
            Map<String, Object> body = Map.of(
                    "documentoTexto", documentoCanonico,
                    "pacienteId", pacienteId,
                    "medicoUid", medicoUid
            );
            String token = currentBearerToken();
            WebClient.RequestBodySpec spec = webClient.post().uri("/recetas")
                    .header("Content-Type", "application/json");
            if (token != null) spec = (WebClient.RequestBodySpec) spec.header("Authorization", "Bearer " + token);

            Map<String, Object> response = spec.bodyValue(body).retrieve()
                    .bodyToMono(new org.springframework.core.ParameterizedTypeReference<Map<String, Object>>() {})
                    .timeout(timeout)
                    .onErrorResume(e -> { log.warn("Llamada blockchain fallo: {}", e.getMessage()); return Mono.empty(); })
                    .block();

            if (response == null) return null;
            return new RegistroBlockchain(
                    (String) response.get("hash"),
                    (String) response.get("txHash"),
                    response.get("id") == null ? null : Long.valueOf(response.get("id").toString()));
        } catch (Exception e) {
            log.warn("BlockchainClient.registrarReceta excepcion: {}", e.getMessage());
            return null;
        }
    }

    public Map<String, Object> verificarHash(String hash) {
        if (!enabled) return Map.of("exists", false);
        try {
            return webClient.get().uri(uriBuilder -> uriBuilder.path("/recetas/verificar").queryParam("hash", hash).build())
                    .retrieve().bodyToMono(new org.springframework.core.ParameterizedTypeReference<Map<String, Object>>() {})
                    .timeout(timeout)
                    .block();
        } catch (Exception e) {
            log.warn("verificarHash fallo: {}", e.getMessage());
            return Map.of("exists", false, "error", e.getMessage());
        }
    }

    private String currentBearerToken() {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth instanceof JwtAuthenticationToken jwt) {
            Jwt token = jwt.getToken();
            return token.getTokenValue();
        }
        return null;
    }

    public record RegistroBlockchain(String hash, String txHash, Long blockchainId) {}
}
