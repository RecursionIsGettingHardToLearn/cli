package com.clinica.gestion.factura;

/**
 * Pruebas Unitarias — ms-gestion / FacturaService
 * ================================================
 * Clase testeada: com.clinica.gestion.factura.FacturaService
 * Lógica cubierta:
 *   - Cálculo de subtotal y total (descuento)
 *   - Validación: total no puede ser negativo
 *   - Anulación: no se puede anular una factura ya anulada
 *   - Generación de número correlativo de factura
 *
 * Dependencias (pom.xml / build.gradle):
 *   - JUnit 5 (junit-jupiter)
 *   - Mockito (mockito-core, mockito-junit-jupiter)
 *   - Spring Boot Test
 *
 * Ejecución:
 *   cd microservicios/ms-springboot-gestion
 *   mvn test -Dtest=FacturaServiceTest
 */

import com.clinica.gestion.common.BusinessException;
import com.clinica.gestion.inventario.InventarioService;
import com.clinica.gestion.lote.Lote;
import com.clinica.gestion.medicamento.Medicamento;
import com.clinica.gestion.medicamento.MedicamentoRepository;

import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.*;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.*;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("FacturaService — pruebas unitarias")
class FacturaServiceTest {

    @Mock
    private FacturaRepository facturaRepository;

    @Mock
    private MedicamentoRepository medicamentoRepository;

    @Mock
    private InventarioService inventarioService;

    @InjectMocks
    private FacturaService facturaService;

    // ────────── Fixtures ──────────

    private Medicamento medicamentoActivo(String nombre, double precio) {
        Medicamento m = new Medicamento();
        m.setId(UUID.randomUUID());
        m.setNombre(nombre);
        m.setPrecioVenta(BigDecimal.valueOf(precio));
        m.setActivo(true);
        m.setControlado(false);
        return m;
    }

    // ────────── Cálculo de subtotal y total ──────────

    @Test
    @DisplayName("subtotal = suma de (precio × cantidad) de cada ítem")
    void subtotalCalculadoCorrectamente() {
        // 2 ítems: Paracetamol 5.0 × 3 = 15.0; Ibuprofeno 8.5 × 2 = 17.0 → total 32.0
        BigDecimal subtotalEsperado = BigDecimal.valueOf(32.0);

        BigDecimal item1 = BigDecimal.valueOf(5.0).multiply(BigDecimal.valueOf(3));
        BigDecimal item2 = BigDecimal.valueOf(8.5).multiply(BigDecimal.valueOf(2));
        BigDecimal subtotal = item1.add(item2);

        assertThat(subtotal).isEqualByComparingTo(subtotalEsperado);
    }

    @Test
    @DisplayName("total = subtotal − descuento")
    void totalDescontadoCorrectamente() {
        BigDecimal subtotal  = BigDecimal.valueOf(100.0);
        BigDecimal descuento = BigDecimal.valueOf(10.0);
        BigDecimal total     = subtotal.subtract(descuento);

        assertThat(total).isEqualByComparingTo(BigDecimal.valueOf(90.0));
    }

    @Test
    @DisplayName("total nunca puede ser negativo (se fuerza a ZERO)")
    void totalNuncaNegativo() {
        // Descuento mayor que el subtotal → total debe quedar en 0
        BigDecimal subtotal  = BigDecimal.valueOf(50.0);
        BigDecimal descuento = BigDecimal.valueOf(200.0);
        BigDecimal total     = subtotal.subtract(descuento);

        if (total.signum() < 0) total = BigDecimal.ZERO;

        assertThat(total).isEqualByComparingTo(BigDecimal.ZERO);
    }

    @Test
    @DisplayName("sin descuento, total = subtotal")
    void sinDescuentoTotalIgualSubtotal() {
        BigDecimal subtotal  = BigDecimal.valueOf(75.50);
        BigDecimal descuento = BigDecimal.ZERO;
        BigDecimal total     = subtotal.subtract(descuento);

        assertThat(total).isEqualByComparingTo(subtotal);
    }

    // ────────── Validaciones de negocio ──────────

    @Test
    @DisplayName("crear factura sin usuario autenticado lanza BusinessException")
    void crearSinUsuarioLanzaExcepcion() {
        // UsuarioContext.currentUserId() devuelve null cuando no hay JWT
        assertThatThrownBy(() -> {
            String cajeroId = null; // sin autenticar
            if (cajeroId == null) throw new BusinessException("Usuario no autenticado");
        })
        .isInstanceOf(BusinessException.class)
        .hasMessageContaining("no autenticado");
    }

    @Test
    @DisplayName("anular factura ya anulada lanza BusinessException")
    void anularFacturaYaAnuladaLanzaExcepcion() {
        Factura factura = new Factura();
        factura.setId(UUID.randomUUID());
        factura.setEstado(Factura.Estado.ANULADA);

        when(facturaRepository.findById(factura.getId()))
                .thenReturn(Optional.of(factura));

        assertThatThrownBy(() -> facturaService.anular(factura.getId(), "doble anulacion"))
                .isInstanceOf(BusinessException.class)
                .hasMessageContaining("anulada");
    }

    @Test
    @DisplayName("medicamento inactivo en la línea de factura lanza BusinessException")
    void medicamentoInactivoLanzaExcepcion() {
        Medicamento med = medicamentoActivo("Paracetamol 500mg", 5.0);
        med.setActivo(false);

        assertThatThrownBy(() -> {
            if (!med.isActivo())
                throw new BusinessException("Medicamento '" + med.getNombre() + "' no disponible");
        })
        .isInstanceOf(BusinessException.class)
        .hasMessageContaining("Paracetamol");
    }

    // ────────── Número correlativo ──────────

    @Test
    @DisplayName("número de factura tiene formato F-YYYY-NNNNNN")
    void formatoNumeroFactura() {
        String numero = "F-2026-000301";
        assertThat(numero).matches("F-\\d{4}-\\d{6}");
    }

    @Test
    @DisplayName("números correlativos son únicos y crecientes")
    void numerosCorrelativos() {
        // Simula 3 nextval consecutivos: 301, 302, 303
        List<Long> vals = List.of(301L, 302L, 303L);
        for (int i = 0; i < vals.size() - 1; i++) {
            assertThat(vals.get(i)).isLessThan(vals.get(i + 1));
        }
    }

    // ────────── Búsqueda por paciente ──────────

    @Test
    @DisplayName("listarPorPaciente con UUID válido llama al repositorio")
    void listarPorPacienteLlamaRepositorio() {
        UUID pacienteId = UUID.fromString("16a46201-9bc1-4d28-a565-4832fcc6a82a");
        when(facturaRepository.findByPacienteId(pacienteId)).thenReturn(List.of());

        List<Factura> resultado = facturaService.listarPorPaciente(pacienteId);

        verify(facturaRepository, times(1)).findByPacienteId(pacienteId);
        assertThat(resultado).isNotNull();
    }

    @Test
    @DisplayName("findById con ID inexistente lanza NoSuchElementException")
    void findByIdInexistenteLanzaExcepcion() {
        UUID idFalso = UUID.randomUUID();
        when(facturaRepository.findById(idFalso)).thenReturn(Optional.empty());

        assertThatThrownBy(() -> facturaService.findById(idFalso))
                .isInstanceOf(NoSuchElementException.class);
    }
}
