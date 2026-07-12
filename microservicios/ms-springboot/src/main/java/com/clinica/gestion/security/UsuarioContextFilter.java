package com.clinica.gestion.security;

import com.clinica.gestion.common.context.UsuarioContext;
import com.clinica.gestion.usuario.RolEnum;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Map;
import java.util.UUID;

/**
 * Pobla {@link UsuarioContext} con los datos del JWT de Supabase para el request
 * actual. No consulta BD: usuario/rol ya no viven en MS3 (estan en MS1/Supabase).
 */
@Slf4j
public class UsuarioContextFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain)
            throws ServletException, IOException {

        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth instanceof JwtAuthenticationToken jwt) {
            try {
                String uid = jwt.getToken().getSubject();
                String email = jwt.getToken().getClaim("email");
                String nombre = extractNombre(jwt);
                RolEnum rol = extractRol(jwt);
                UsuarioContext.set(new UsuarioContext.Actor(parseUuid(uid), uid, email, nombre, rol));
            } catch (Exception e) {
                log.warn("Error poblando UsuarioContext desde JWT: {}", e.getMessage());
            }
        }
        try { chain.doFilter(req, res); }
        finally { UsuarioContext.clear(); }
    }

    private static UUID parseUuid(String s) {
        try { return s == null ? null : UUID.fromString(s); }
        catch (IllegalArgumentException e) { return null; }  // sub no-UUID (modo dev/seed)
    }

    private String extractNombre(JwtAuthenticationToken jwt) {
        Object userMeta = jwt.getToken().getClaim("user_metadata");
        if (userMeta instanceof Map<?,?> meta) {
            Object n = meta.get("name");
            if (n != null) return n.toString();
        }
        return jwt.getToken().getClaim("email");
    }

    private RolEnum extractRol(JwtAuthenticationToken jwt) {
        Object appMeta = jwt.getToken().getClaim("app_metadata");
        if (appMeta instanceof Map<?,?> meta) {
            Object role = meta.get("role");
            if (role != null) return RolEnum.fromString(role.toString());
        }
        return RolEnum.PACIENTE;
    }
}
