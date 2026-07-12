package com.clinica.gestion.usuario;

public enum RolEnum {
    ADMINISTRADOR(1),
    MEDICO(2),
    FARMACEUTICO(3),
    PACIENTE(4);

    private final int id;

    RolEnum(int id) { this.id = id; }

    public int getId() { return id; }

    public String authority() { return "ROLE_" + name(); }

    public static RolEnum fromString(String s) {
        if (s == null) return PACIENTE;
        try { return RolEnum.valueOf(s.toUpperCase()); }
        catch (IllegalArgumentException e) { return PACIENTE; }
    }
}
