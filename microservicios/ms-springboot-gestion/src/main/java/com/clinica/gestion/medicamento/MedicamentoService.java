package com.clinica.gestion.medicamento;

import com.clinica.gestion.categoria.Categoria;
import com.clinica.gestion.categoria.CategoriaRepository;
import com.clinica.gestion.common.exception.NotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class MedicamentoService {

    private final MedicamentoRepository medicamentoRepository;
    private final CategoriaRepository categoriaRepository;

    @Transactional(readOnly = true)
    public List<Medicamento> listar(String q, Boolean activo) {
        return medicamentoRepository.buscar(q, activo);
    }

    @Transactional(readOnly = true)
    public Medicamento findById(UUID id) {
        return medicamentoRepository.findById(id)
                .orElseThrow(() -> new NotFoundException("Medicamento", id));
    }

    @Transactional
    public Medicamento crear(MedicamentoInput in) {
        Categoria c = in.categoriaId() == null ? null
                : categoriaRepository.findById(in.categoriaId())
                .orElseThrow(() -> new NotFoundException("Categoria", in.categoriaId()));
        Medicamento m = Medicamento.builder()
                .nombre(in.nombre()).descripcion(in.descripcion()).categoria(c)
                .precioVenta(in.precioVenta())
                .requiereReceta(Boolean.TRUE.equals(in.requiereReceta()))
                .controlado(Boolean.TRUE.equals(in.controlado()))
                .stockMinimo(in.stockMinimo() == null ? 0 : in.stockMinimo())
                .activo(true)
                .build();
        return medicamentoRepository.save(m);
    }

    @Transactional
    public Medicamento actualizar(UUID id, MedicamentoInput in) {
        Medicamento m = findById(id);
        m.setNombre(in.nombre());
        m.setDescripcion(in.descripcion());
        if (in.categoriaId() != null) {
            m.setCategoria(categoriaRepository.findById(in.categoriaId())
                    .orElseThrow(() -> new NotFoundException("Categoria", in.categoriaId())));
        }
        m.setPrecioVenta(in.precioVenta());
        m.setRequiereReceta(Boolean.TRUE.equals(in.requiereReceta()));
        m.setControlado(Boolean.TRUE.equals(in.controlado()));
        if (in.stockMinimo() != null) m.setStockMinimo(in.stockMinimo());
        return medicamentoRepository.save(m);
    }

    @Transactional
    public Medicamento desactivar(UUID id) {
        Medicamento m = findById(id);
        m.setActivo(false);
        return medicamentoRepository.save(m);
    }
}
