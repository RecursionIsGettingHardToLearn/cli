package com.clinica.gestion.common.client;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.client.reactive.ReactorClientHttpConnector;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import reactor.core.publisher.Mono;
import reactor.netty.http.client.HttpClient;

import java.time.Duration;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Cliente HTTP hacia MS1 (ms-pacientes) para resolver datos de paciente que ya no
 * viven en MS3. Analogo a {@code BlockchainClient}. Resiliente: si MS1 esta
 * deshabilitado o no responde, devuelve {@link Optional#empty()} (degradacion elegante).
 *
 * <p>MS1 ya existe (Next.js en :3000). Con {@code app.pacientes.enabled=true} resuelve
 * supabase_uid -> pacienteId via el endpoint interno de MS1:
 * <pre>GET {base-url}/api/internal/pacientes/by-uid/{supabaseUid} -> { "id": "&lt;uuid&gt;" }</pre>
 */
@Slf4j
@Component
public class PacienteClient {

    private final WebClient webClient;
    private final boolean enabled;
    private final Duration timeout = Duration.ofSeconds(5);

    public PacienteClient(
            @Value("${app.pacientes.base-url:http://localhost:3000}") String baseUrl,
            @Value("${app.pacientes.enabled:false}") boolean enabled) {
        this.enabled = enabled;
        this.webClient = WebClient.builder()
                .baseUrl(baseUrl)
                .clientConnector(new ReactorClientHttpConnector(HttpClient.create()))
                .build();
    }

    /** Resuelve el pacienteId (UUID en MS1) a partir del supabase_uid del JWT. */
    public Optional<UUID> pacienteIdPorSupabaseUid(String supabaseUid) {
        if (!enabled || supabaseUid == null) {
            if (!enabled) log.debug("PacienteClient deshabilitado — devuelvo vacio");
            return Optional.empty();
        }
        try {
            Map<?, ?> resp = webClient.get()
                    .uri("/api/internal/pacientes/by-uid/{uid}", supabaseUid)
                    .headers(h -> { String t = bearer(); if (t != null) h.setBearerAuth(t); })
                    .retrieve()
                    .bodyToMono(Map.class)
                    .timeout(timeout)
                    .onErrorResume(e -> { log.warn("PacienteClient fallo: {}", e.getMessage()); return Mono.empty(); })
                    .block();
            if (resp == null || resp.get("id") == null) return Optional.empty();
            return Optional.of(UUID.fromString(resp.get("id").toString()));
        } catch (Exception e) {
            log.warn("PacienteClient.pacienteIdPorSupabaseUid excepcion: {}", e.getMessage());
            return Optional.empty();
        }
    }

    private String bearer() {
        var auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth instanceof JwtAuthenticationToken jwt) return jwt.getToken().getTokenValue();
        return null;
    }
}
