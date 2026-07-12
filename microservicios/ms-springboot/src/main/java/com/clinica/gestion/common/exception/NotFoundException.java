package com.clinica.gestion.common.exception;

public class NotFoundException extends RuntimeException {
    public NotFoundException(String entity, Object id) {
        super(entity + " no encontrado con id=" + id);
    }

    public NotFoundException(String message) {
        super(message);
    }
}
