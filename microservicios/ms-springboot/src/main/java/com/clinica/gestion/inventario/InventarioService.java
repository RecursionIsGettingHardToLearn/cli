package com.clinica.gestion.inventario;

import com.clinica.gestion.common.context.UsuarioContext;
import com.clinica.gestion.common.exception.BusinessException;
import com.clinica.gestion.common.exception.NotFoundException;
import com.clinica.gestion.medicamento.Medicamento;
import com.clinica.gestion.medicamento.MedicamentoRepository;
import com.clinica.gestion.proveedor.Proveedor;
import com.clinica.gestion.proveedor.ProveedorRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class InventarioService {

    private final LoteRepository loteRepository;
    private final MovimientoInventarioRepository movimientoRepository;
    private final MedicamentoRepository medicamentoRepository;
    private final ProveedorRepository proveedorRepository;

    @Transactional(readOnly = true)
    public List<Lote> lotesByMedicamento(UUID medicamentoId) {
        return loteRepository.findByMedicamento(medicamentoId);
    }

    @Transactional(readOnly = true)
    public List<MovimientoInventario> movimientosByLote(UUID loteId) {
        return movimientoRepository.findByLoteIdOrderByFechaDesc(loteId);
    }

    @Transactional
    public Lote registrarEntradaLote(LoteInput in) {
        Medicamento med = medicamentoRepository.findById(in.medicamentoId())
                .orElseThrow(() -> new NotFoundException("Medicamento", in.medicamentoId()));
        Proveedor prov = in.proveedorId() == null ? null
                : proveedorRepository.findById(in.proveedorId())
                .orElseThrow(() -> new NotFoundException("Proveedor", in.proveedorId()));

        Lote lote = Lote.builder()
                .medicamento(med).proveedor(prov)
                .codigoLote(in.codigoLote())
                .fechaVencimiento(in.fechaVencimiento())
                .cantidadInicial(in.cantidad())
                .cantidadActual(in.cantidad())
                .precioCompra(in.precioCompra())
                .build();
        lote = loteRepository.save(lote);

        movimientoRepository.save(MovimientoInventario.builder()
                .lote(lote).tipo(TipoMovimiento.ENTRADA)
                .cantidad(in.cantidad())
                .motivo("Entrada de lote " + in.codigoLote())
                .usuarioId(UsuarioContext.currentUserId())
                .build());
        return lote;
    }

    @Transactional
    public MovimientoInventario ajustarStock(UUID loteId, int cantidad, String motivo) {
        Lote lote = loteRepository.findById(loteId)
                .orElseThrow(() -> new NotFoundException("Lote", loteId));
        int nuevo = lote.getCantidadActual() + cantidad;
        if (nuevo < 0) throw new BusinessException("El ajuste deja stock negativo");
        lote.setCantidadActual(nuevo);
        loteRepository.save(lote);

        return movimientoRepository.save(MovimientoInventario.builder()
                .lote(lote).tipo(TipoMovimiento.AJUSTE)
                .cantidad(cantidad)
                .motivo(motivo)
                .usuarioId(UsuarioContext.currentUserId())
                .build());
    }

    /**
     * Descuenta cantidad de un medicamento aplicando FIFO por fecha de vencimiento.
     * Devuelve los lotes utilizados con su cantidad consumida (para detalles de factura).
     */
    @Transactional
    public List<ConsumoLote> descontarFIFO(UUID medicamentoId, int cantidad, String motivo) {
        if (cantidad <= 0) throw new BusinessException("Cantidad debe ser positiva");

        List<Lote> disponibles = loteRepository.findDisponiblesFIFO(medicamentoId);
        int totalDisponible = disponibles.stream().mapToInt(Lote::getCantidadActual).sum();
        if (totalDisponible < cantidad) {
            throw new BusinessException("Stock insuficiente para medicamento " + medicamentoId
                    + " (disponible=" + totalDisponible + ", requerido=" + cantidad + ")");
        }

        int restante = cantidad;
        List<ConsumoLote> consumos = new ArrayList<>();
        for (Lote l : disponibles) {
            if (restante <= 0) break;
            int tomar = Math.min(l.getCantidadActual(), restante);
            l.setCantidadActual(l.getCantidadActual() - tomar);
            loteRepository.save(l);

            movimientoRepository.save(MovimientoInventario.builder()
                    .lote(l).tipo(TipoMovimiento.SALIDA)
                    .cantidad(tomar)
                    .motivo(motivo)
                    .usuarioId(UsuarioContext.currentUserId())
                    .build());

            consumos.add(new ConsumoLote(l, tomar));
            restante -= tomar;
        }
        return consumos;
    }

    public record ConsumoLote(Lote lote, int cantidad) {}
}
