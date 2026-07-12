package com.clinica.gestion.proveedor;

import org.springframework.data.jpa.repository.JpaRepository;

import java.util.UUID;

public interface ProveedorRepository extends JpaRepository<Proveedor, UUID> {
}
