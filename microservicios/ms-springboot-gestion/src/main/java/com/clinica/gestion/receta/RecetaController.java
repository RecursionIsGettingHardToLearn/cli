package com.clinica.gestion.receta;

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
import java.util.Map;
import java.util.UUID;

@Controller
@RequiredArgsConstructor
public class RecetaController {

    private final RecetaService recetaService;
    private final PacienteClient pacienteClient;

    @QueryMapping
    @PreAuthorize("hasAnyRole('ADMINISTRADOR','MEDICO','FARMACEUTICO')")
    public Receta receta(@Argument UUID id) {
        return recetaService.findById(id);
    }

    @QueryMapping
    @PreAuthorize("hasAnyRole('ADMINISTRADOR','MEDICO','FARMACEUTICO')")
    public List<Receta> recetasPorPaciente(@Argument UUID pacienteId) {
        return recetaService.listarPorPaciente(pacienteId);
    }

    @QueryMapping
    @PreAuthorize("hasRole('MEDICO')")
    public List<Receta> misRecetas() {
        return recetaService.listarPorMedico(currentSupabaseUid());
    }

    @QueryMapping
    @PreAuthorize("hasRole('PACIENTE')")
    public List<Receta> misRecetasPaciente() {
        // El mapeo supabase_uid -> pacienteId vive en MS1; se resuelve por HTTP.
        return pacienteClient.pacienteIdPorSupabaseUid(currentSupabaseUid())
                .map(recetaService::listarPorPaciente)
                .orElse(Collections.emptyList());
    }

    @MutationMapping
    @PreAuthorize("hasRole('MEDICO')")
    public Receta emitirReceta(@Argument @Valid RecetaInput input) {
        JwtAuthenticationToken jwt = currentJwt();
        // Forzar medicoUid/medicoNombre desde el JWT, ignorar lo que envie el cliente.
        RecetaInput safe = new RecetaInput(
                input.pacienteId(),
                nombreFromJwt(jwt),
                jwt.getToken().getSubject(),
                input.diagnostico(),
                input.detalles());
        return recetaService.emitir(safe);
    }

    @QueryMapping
    @PreAuthorize("hasAnyRole('ADMINISTRADOR','MEDICO','FARMACEUTICO','PACIENTE')")
    public VerificacionReceta verificarReceta(@Argument UUID id) {
        return recetaService.verificarReceta(id);
    }

    /**
     * Lee el JWT actual directamente del SecurityContext (el ThreadLocal UsuarioContext
     * no se propaga de forma fiable entre el filter y los resolvers GraphQL).
     */
    private JwtAuthenticationToken currentJwt() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (!(auth instanceof JwtAuthenticationToken jwt)) {
            throw new AccessDeniedException("Usuario no autenticado");
        }
        return jwt;
    }

    private String currentSupabaseUid() {
        return currentJwt().getToken().getSubject();
    }

    private String nombreFromJwt(JwtAuthenticationToken jwt) {
        Object userMeta = jwt.getToken().getClaim("user_metadata");
        if (userMeta instanceof Map<?, ?> meta) {
            Object n = meta.get("name");
            if (n != null) return n.toString();
        }
        String email = jwt.getToken().getClaim("email");
        return email != null ? email : jwt.getToken().getSubject();
    }
}
