package com.clinica.gestion.factura;

import com.clinica.gestion.common.context.UsuarioContext;
import com.clinica.gestion.common.exception.BusinessException;
import com.clinica.gestion.common.exception.NotFoundException;
import com.clinica.gestion.inventario.InventarioService;
import com.clinica.gestion.inventario.Lote;
import com.clinica.gestion.medicamento.Medicamento;
import com.clinica.gestion.medicamento.MedicamentoRepository;
import com.clinica.gestion.receta.Receta;
import com.clinica.gestion.receta.RecetaRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class FacturaService {

    private final FacturaRepository facturaRepository;
    private final MedicamentoRepository medicamentoRepository;
    private final RecetaRepository recetaRepository;
    private final InventarioService inventarioService;

    @Transactional(readOnly = true)
    public List<Factura> listar() { return facturaRepository.findAll(); }

    @Transactional(readOnly = true)
    public Factura findById(UUID id) {
        return facturaRepository.findById(id).orElseThrow(() -> new NotFoundException("Factura", id));
    }

    @Transactional(readOnly = true)
    public List<Factura> listarPorPaciente(UUID pacienteId) {
        return facturaRepository.findByPacienteIdOrderByFechaDesc(pacienteId);
    }

    /**
     * Crea una factura: valida stock, valida recetas para medicamentos que las requieren,
     * descuenta inventario FIFO por vencimiento, persiste detalles. Todo en una transaccion.
     */
    @Transactional
    public Factura crear(FacturaInput in) {
        UUID cajeroId = UsuarioContext.currentUserId();
        if (cajeroId == null) throw new BusinessException("Usuario no autenticado");

        Factura factura = Factura.builder()
                .numero(generarNumero())
                .pacienteId(in.pacienteId()).usuarioId(cajeroId)
                .metodoPago(in.metodoPago())
                .descuento(in.descuento() == null ? BigDecimal.ZERO : in.descuento())
                .subtotal(BigDecimal.ZERO).total(BigDecimal.ZERO)
                .estado(Boolean.TRUE.equals(in.pendiente()) ? EstadoFactura.PENDIENTE : EstadoFactura.PAGADA)
                .build();

        BigDecimal subtotal = BigDecimal.ZERO;

        for (FacturaInput.ItemInput it : in.items()) {
            Medicamento med = medicamentoRepository.findById(it.medicamentoId())
                    .orElseThrow(() -> new NotFoundException("Medicamento", it.medicamentoId()));

            Receta receta = null;
            if (Boolean.TRUE.equals(med.getRequiereReceta())) {
                if (it.recetaId() == null) {
                    throw new BusinessException("Medicamento '" + med.getNombre()
                            + "' requiere receta — falta recetaId");
                }
                receta = recetaRepository.findById(it.recetaId())
                        .orElseThrow(() -> new NotFoundException("Receta", it.recetaId()));
                if (Boolean.TRUE.equals(med.getControlado()) && receta.getBlockchainTx() == null) {
                    // Permitir continuar pero alertar: la receta controlada aun no se registro on-chain
                    // (el reintento del @Scheduled deberia haberse hecho cargo)
                }
            }

            List<InventarioService.ConsumoLote> consumos = inventarioService.descontarFIFO(
                    med.getId(), it.cantidad(), "Venta factura");

            for (InventarioService.ConsumoLote c : consumos) {
                Lote l = c.lote();
                BigDecimal precio = med.getPrecioVenta();
                BigDecimal sub = precio.multiply(BigDecimal.valueOf(c.cantidad()));
                subtotal = subtotal.add(sub);

                DetalleFactura df = DetalleFactura.builder()
                        .factura(factura).medicamento(med).lote(l).receta(receta)
                        .cantidad(c.cantidad()).precioUnitario(precio).subtotal(sub)
                        .build();
                factura.getDetalles().add(df);
            }
        }

        factura.setSubtotal(subtotal);
        BigDecimal total = subtotal.subtract(factura.getDescuento());
        if (total.signum() < 0) total = BigDecimal.ZERO;
        factura.setTotal(total);

        return facturaRepository.save(factura);
    }

    @Transactional
    public Factura anular(UUID id, String motivo) {
        Factura f = findById(id);
        if (f.getEstado() == EstadoFactura.ANULADA) {
            throw new BusinessException("La factura ya esta anulada");
        }
        f.setEstado(EstadoFactura.ANULADA);
        // No revertimos stock automaticamente — decision de negocio.
        // Si se requiere, agregar movimientos AJUSTE manualmente.
        return facturaRepository.save(f);
    }

    /** Vincula la sesion de Stripe Checkout creada para esta factura (trazabilidad). */
    @Transactional
    public void vincularStripeSession(UUID id, String sessionId) {
        Factura f = findById(id);
        f.setStripeSessionId(sessionId);
        facturaRepository.save(f);
    }

    /** Confirmacion de pago online (la llama el webhook de Stripe). Idempotente. */
    @Transactional
    public Factura marcarPagada(UUID id, String stripeSessionId) {
        Factura f = findById(id);
        if (f.getEstado() == EstadoFactura.ANULADA) {
            throw new BusinessException("La factura esta anulada; no puede pagarse");
        }
        if (f.getEstado() == EstadoFactura.PAGADA) {
            return f; // idempotente: reintentos/replays del webhook no duplican nada
        }
        f.setEstado(EstadoFactura.PAGADA);
        f.setMetodoPago(MetodoPago.TARJETA);
        f.setStripeSessionId(stripeSessionId);
        f.setPagadaEn(OffsetDateTime.now());
        return facturaRepository.save(f);
    }

    private String generarNumero() {
        long secuencia = facturaRepository.count() + 1;
        return "F-" + LocalDate.now().getYear() + "-" + String.format("%06d", secuencia);
    }
}
