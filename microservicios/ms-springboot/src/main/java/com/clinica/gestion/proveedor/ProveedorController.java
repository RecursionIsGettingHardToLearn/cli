package com.clinica.gestion.proveedor;

import com.clinica.gestion.common.exception.NotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.graphql.data.method.annotation.Argument;
import org.springframework.graphql.data.method.annotation.MutationMapping;
import org.springframework.graphql.data.method.annotation.QueryMapping;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Controller;

import java.util.List;
import java.util.UUID;

@Controller
@RequiredArgsConstructor
public class ProveedorController {

    private final ProveedorRepository proveedorRepository;

    @QueryMapping
    @PreAuthorize("hasAnyRole('ADMINISTRADOR','FARMACEUTICO')")
    public List<Proveedor> proveedores() {
        return proveedorRepository.findAll();
    }

    @QueryMapping
    @PreAuthorize("hasAnyRole('ADMINISTRADOR','FARMACEUTICO')")
    public Proveedor proveedor(@Argument UUID id) {
        return proveedorRepository.findById(id).orElseThrow(() -> new NotFoundException("Proveedor", id));
    }

    @MutationMapping
    @PreAuthorize("hasAnyRole('ADMINISTRADOR','FARMACEUTICO')")
    public Proveedor crearProveedor(
            @Argument String nombre, @Argument String nit,
            @Argument String telefono, @Argument String email, @Argument String direccion) {
        return proveedorRepository.save(Proveedor.builder()
                .nombre(nombre).nit(nit).telefono(telefono)
                .email(email).direccion(direccion).activo(true).build());
    }

    @MutationMapping
    @PreAuthorize("hasRole('ADMINISTRADOR')")
    public Proveedor desactivarProveedor(@Argument UUID id) {
        Proveedor p = proveedorRepository.findById(id).orElseThrow(() -> new NotFoundException("Proveedor", id));
        p.setActivo(false);
        return proveedorRepository.save(p);
    }
}
