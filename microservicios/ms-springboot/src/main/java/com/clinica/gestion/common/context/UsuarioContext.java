package com.clinica.gestion.common.context;

import com.clinica.gestion.usuario.RolEnum;

import java.util.UUID;

/**
 * Contexto del usuario autenticado para el request actual, derivado del JWT de
 * Supabase. MS3 ya no tiene tabla usuario (vive en MS1): el id es el supabase_uid
 * (que es un UUID) y se usa como referencia usuario_id hacia MS1.
 */
public final class UsuarioContext {

    /** Datos minimos del actor autenticado, tomados del JWT (sin BD). */
    public record Actor(UUID id, String uid, String email, String nombre, RolEnum rol) {}

    private static final ThreadLocal<Actor> CURRENT = new ThreadLocal<>();

    private UsuarioContext() {}

    public static void set(Actor a) { CURRENT.set(a); }

    public static Actor current() { return CURRENT.get(); }

    /** UUID del usuario (supabase_uid) para usar como usuario_id; null si no hay sesion. */
    public static UUID currentUserId() {
        Actor a = CURRENT.get();
        return a == null ? null : a.id();
    }

    public static void clear() { CURRENT.remove(); }
}
