package com.clinica.gestion.categoria;

import com.clinica.gestion.common.exception.BusinessException;
import com.clinica.gestion.common.exception.NotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.graphql.data.method.annotation.Argument;
import org.springframework.graphql.data.method.annotation.MutationMapping;
import org.springframework.graphql.data.method.annotation.QueryMapping;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Controller;

import java.util.List;

@Controller
@RequiredArgsConstructor
public class CategoriaController {

    private final CategoriaRepository categoriaRepository;

    @QueryMapping
    public List<Categoria> categorias() {
        return categoriaRepository.findAll();
    }

    @MutationMapping
    @PreAuthorize("hasAnyRole('ADMINISTRADOR','FARMACEUTICO')")
    public Categoria crearCategoria(@Argument String nombre, @Argument String descripcion) {
        if (nombre == null || nombre.isBlank()) throw new BusinessException("Nombre requerido");
        return categoriaRepository.save(Categoria.builder().nombre(nombre).descripcion(descripcion).build());
    }

    @MutationMapping
    @PreAuthorize("hasRole('ADMINISTRADOR')")
    public Categoria actualizarCategoria(@Argument Integer id, @Argument String nombre, @Argument String descripcion) {
        Categoria c = categoriaRepository.findById(id).orElseThrow(() -> new NotFoundException("Categoria", id));
        if (nombre != null) c.setNombre(nombre);
        if (descripcion != null) c.setDescripcion(descripcion);
        return categoriaRepository.save(c);
    }
}
