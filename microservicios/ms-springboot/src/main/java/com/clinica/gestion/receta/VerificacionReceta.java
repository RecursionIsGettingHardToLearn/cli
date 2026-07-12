package com.clinica.gestion.receta;

public record VerificacionReceta(
        Boolean exists,
        Long id,
        Long timestamp,
        Long blockNumber,
        String razon,
        String error
) {
    public static VerificacionReceta notFound(String razon) {
        return new VerificacionReceta(false, null, null, null, razon, null);
    }
}
