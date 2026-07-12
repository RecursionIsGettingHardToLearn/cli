package com.clinica.gestion.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.auditing.DateTimeProvider;
import org.springframework.data.jpa.repository.config.EnableJpaAuditing;

import java.time.OffsetDateTime;
import java.util.Optional;

/**
 * Configura el JpaAuditing para usar OffsetDateTime en vez del LocalDateTime
 * por defecto. Las entidades usan @CreatedDate/@LastModifiedDate sobre columnas
 * TIMESTAMPTZ (OffsetDateTime), por eso necesitamos un provider explicito.
 */
@Configuration
@EnableJpaAuditing(dateTimeProviderRef = "auditingDateTimeProvider")
public class AuditingConfig {

    @Bean
    public DateTimeProvider auditingDateTimeProvider() {
        return () -> Optional.of(OffsetDateTime.now());
    }
}
