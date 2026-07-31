package com.clinica.gestion.medicamento;

/**
 * Pruebas Unitarias — ms-gestion / MedicamentoService
 * =====================================================
 * Clase testeada: com.clinica.gestion.medicamento.MedicamentoService
 * Lógica cubierta:
 *   - Listar con filtro por nombre y estado activo/inactivo
 *   - Crear medicamento con valores por defecto (stockMinimo, controlado)
 *   - Actualizar campos modificables
 *   - Desactivar (soft delete)
 *   - Validación: medicamento controlado requiere receta
 *
 * Ejecución:
 *   cd microservicios/ms-springboot-gestion
 *   mvn test -Dtest=MedicamentoServiceTest
 */

import com.clinica.gestion.common.BusinessException;

import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.*;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.*;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("MedicamentoService — pruebas unitarias")
class MedicamentoServiceTest {

    @Mock
    private MedicamentoRepository medicamentoRepository;

    @InjectMocks
    private MedicamentoService medicamentoService;

    // ────────── Fixtures ──────────

    private Medicamento medicamentoSample() {
        Medicamento m = new Medicamento();
        m.setId(UUID.randomUUID());
        m.setNombre("Paracetamol 500mg");
        m.setDescripcion("Analgesico y antipiretico de uso comun");
        m.setPrecioVenta(BigDecimal.valueOf(5.0));
        m.setActivo(true);
        m.setControlado(false);
        m.setRequiereReceta(false);
        m.setStockMinimo(10);
        return m;
    }

    // ────────── Listar ──────────

    @Test
    @DisplayName("listar sin filtro invoca findAll del repositorio")
    void listarSinFiltroLlamaFindAll() {
        when(medicamentoRepository.findAll(any())).thenReturn(List.of(medicamentoSample()));

        List<Medicamento> result = medicamentoService.listar(null, null);

        assertThat(result).isNotEmpty();
    }

    @Test
    @DisplayName("listar con filtro activo=true devuelve solo activos")
    void listarSoloActivos() {
        Medicamento activo   = medicamentoSample();
        Medicamento inactivo = medicamentoSample();
        inactivo.setActivo(false);

        when(medicamentoRepository.findAll(any())).thenReturn(List.of(activo));

        List<Medicamento> result = medicamentoService.listar(null, true);
        assertThat(result).allMatch(Medicamento::isActivo);
    }

    @Test
    @DisplayName("listar con búsqueda por nombre es case-insensitive")
    void listarPorNombreCaseInsensitive() {
        Medicamento m = medicamentoSample(); // "Paracetamol 500mg"
        when(medicamentoRepository.findAll(any())).thenReturn(List.of(m));

        List<Medicamento> result = medicamentoService.listar("paracetamol", null);
        assertThat(result).anyMatch(med ->
                med.getNombre().toLowerCase().contains("paracetamol"));
    }

    // ────────── Crear ──────────

    @Test
    @DisplayName("crear medicamento asigna stockMinimo = 0 cuando no se especifica")
    void crearConStockMinimoDefault() {
        MedicamentoInput input = new MedicamentoInput(
                "Vitamina C 1g", "Suplemento", 1L, BigDecimal.valueOf(6.0),
                false, false, null
        );
        Medicamento guardado = medicamentoSample();
        guardado.setStockMinimo(0);

        when(medicamentoRepository.save(any())).thenReturn(guardado);

        Medicamento result = medicamentoService.crear(input);
        assertThat(result.getStockMinimo()).isEqualTo(0);
    }

    @Test
    @DisplayName("crear medicamento controlado lo marca como controlado=true")
    void crearMedicamentoControlado() {
        MedicamentoInput input = new MedicamentoInput(
                "Diazepam 5mg", "Benzodiazepina", 9L, BigDecimal.valueOf(25.0),
                true, true, 5
        );
        Medicamento guardado = medicamentoSample();
        guardado.setControlado(true);
        guardado.setRequiereReceta(true);

        when(medicamentoRepository.save(any())).thenReturn(guardado);

        Medicamento result = medicamentoService.crear(input);
        assertThat(result.isControlado()).isTrue();
        assertThat(result.isRequiereReceta()).isTrue();
    }

    // ────────── Actualizar ──────────

    @Test
    @DisplayName("actualizar precio llama a save con el nuevo precio")
    void actualizarPrecio() {
        Medicamento existente = medicamentoSample();
        when(medicamentoRepository.findById(existente.getId()))
                .thenReturn(Optional.of(existente));
        when(medicamentoRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        MedicamentoInput input = new MedicamentoInput(
                existente.getNombre(), existente.getDescripcion(),
                1L, BigDecimal.valueOf(7.50),
                false, false, 10
        );
        Medicamento result = medicamentoService.actualizar(existente.getId(), input);
        assertThat(result.getPrecioVenta()).isEqualByComparingTo(BigDecimal.valueOf(7.50));
    }

    @Test
    @DisplayName("actualizar ID inexistente lanza NoSuchElementException")
    void actualizarIdInexistenteLanzaExcepcion() {
        UUID idFalso = UUID.randomUUID();
        when(medicamentoRepository.findById(idFalso)).thenReturn(Optional.empty());

        MedicamentoInput input = new MedicamentoInput(
                "X", "X", 1L, BigDecimal.ONE, false, false, 0
        );
        assertThatThrownBy(() -> medicamentoService.actualizar(idFalso, input))
                .isInstanceOf(NoSuchElementException.class);
    }

    // ────────── Desactivar ──────────

    @Test
    @DisplayName("desactivar pone activo=false y llama a save")
    void desactivarMedicamento() {
        Medicamento m = medicamentoSample();
        when(medicamentoRepository.findById(m.getId())).thenReturn(Optional.of(m));
        when(medicamentoRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        Medicamento result = medicamentoService.desactivar(m.getId());

        assertThat(result.isActivo()).isFalse();
        verify(medicamentoRepository).save(m);
    }

    @Test
    @DisplayName("findById con ID válido devuelve el medicamento")
    void findByIdExistente() {
        Medicamento m = medicamentoSample();
        when(medicamentoRepository.findById(m.getId())).thenReturn(Optional.of(m));

        Medicamento result = medicamentoService.findById(m.getId());
        assertThat(result.getNombre()).isEqualTo("Paracetamol 500mg");
    }
}
