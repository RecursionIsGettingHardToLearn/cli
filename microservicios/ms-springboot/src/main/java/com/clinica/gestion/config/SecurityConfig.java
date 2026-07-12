package com.clinica.gestion.config;

import com.clinica.gestion.security.SupabaseJwtConverter;
import com.clinica.gestion.security.UsuarioContextFilter;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.jose.jws.SignatureAlgorithm;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
@EnableMethodSecurity
@RequiredArgsConstructor
public class SecurityConfig {

    @Value("${app.supabase.jwks-uri:}")
    private String jwksUri;

    private final SupabaseJwtConverter jwtConverter;

    @Bean
    public UsuarioContextFilter usuarioContextFilter() {
        return new UsuarioContextFilter();
    }

    @Bean
    public SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
        http
                .csrf(csrf -> csrf.disable())
                .cors(cors -> {})
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS));

        if (jwksUri == null || jwksUri.isBlank()) {
            // Modo dev sin Supabase: permite todo para que GraphiQL funcione
            http.authorizeHttpRequests(auth -> auth.anyRequest().permitAll());
        } else {
            http
                    .authorizeHttpRequests(auth -> auth
                            .requestMatchers("/actuator/health", "/actuator/info").permitAll()
                            .requestMatchers("/graphiql", "/graphiql/**", "/graphql", "/graphql/**").permitAll()
                            // Webhook de Stripe: sin JWT; se autentica con la firma Stripe-Signature
                            .requestMatchers("/api/pagos/webhook").permitAll()
                            .anyRequest().authenticated())
                    .oauth2ResourceServer(o -> o.jwt(j -> j.jwtAuthenticationConverter(jwtConverter)))
                    .addFilterAfter(usuarioContextFilter(), UsernamePasswordAuthenticationFilter.class);
        }
        return http.build();
    }

    @Bean
    public JwtDecoder jwtDecoder() {
        if (jwksUri == null || jwksUri.isBlank()) {
            return token -> { throw new IllegalStateException("JWT decoder no configurado (modo dev sin Supabase)"); };
        }
        // Supabase moderno emite JWTs firmados con ES256 (clave EC P-256) — declarar
        // ambos algoritmos comunes para tolerar rotacion del proyecto a RS256.
        return NimbusJwtDecoder.withJwkSetUri(jwksUri)
                .jwsAlgorithms(algs -> { algs.add(SignatureAlgorithm.ES256); algs.add(SignatureAlgorithm.RS256); })
                .build();
    }
}
