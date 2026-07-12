package com.clinica.gestion.security;

import com.clinica.gestion.usuario.RolEnum;
import lombok.extern.slf4j.Slf4j;
import org.springframework.core.convert.converter.Converter;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/**
 * Convierte el JWT de Supabase en una Authentication con el rol como authority.
 * El rol vive SIEMPRE en el JWT (claim app_metadata.role). MS3 ya no consulta la
 * tabla usuario (movida a MS1): la identidad es responsabilidad de Supabase/MS1.
 */
@Slf4j
@Component
public class SupabaseJwtConverter implements Converter<Jwt, AbstractAuthenticationToken> {

    @Override
    public AbstractAuthenticationToken convert(Jwt jwt) {
        RolEnum rol = extractRol(jwt);
        var authorities = List.of(new SimpleGrantedAuthority(rol.authority()));
        return new JwtAuthenticationToken(jwt, authorities, jwt.getSubject());
    }

    private RolEnum extractRol(Jwt jwt) {
        // 1) claim app_metadata.role (preferido — setealo en Supabase Dashboard)
        Object appMeta = jwt.getClaim("app_metadata");
        if (appMeta instanceof Map<?,?> meta) {
            Object role = meta.get("role");
            if (role != null) return RolEnum.fromString(role.toString());
        }
        // 2) claim user_metadata.role (fallback)
        Object userMeta = jwt.getClaim("user_metadata");
        if (userMeta instanceof Map<?,?> meta) {
            Object role = meta.get("role");
            if (role != null) return RolEnum.fromString(role.toString());
        }
        log.warn("JWT sub={} sin rol en claims — asignando PACIENTE", jwt.getSubject());
        return RolEnum.PACIENTE;
    }
}
