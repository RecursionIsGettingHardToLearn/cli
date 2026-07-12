package com.clinica.gestion.receta;

import com.clinica.gestion.common.exception.NotFoundException;
import com.clinica.gestion.medicamento.Medicamento;
import com.clinica.gestion.medicamento.MedicamentoRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class RecetaService {

    private final RecetaRepository recetaRepository;
    private final MedicamentoRepository medicamentoRepository;
    private final BlockchainClient blockchainClient;

    @Transactional(readOnly = true)
    public Receta findById(UUID id) {
        return recetaRepository.findById(id).orElseThrow(() -> new NotFoundException("Receta", id));
    }

    @Transactional(readOnly = true)
    public List<Receta> listarPorPaciente(UUID pacienteId) {
        return recetaRepository.findByPacienteIdOrderByFechaEmisionDesc(pacienteId);
    }

    @Transactional(readOnly = true)
    public List<Receta> listarPorMedico(String medicoUid) {
        return recetaRepository.findByMedicoUidOrderByFechaEmisionDesc(medicoUid);
    }

    @Transactional
    public Receta emitir(RecetaInput in) {
        // paciente_id es una referencia a MS1 (sin FK); no se valida contra BD local.
        Receta receta = Receta.builder()
                .pacienteId(in.pacienteId())
                .medicoNombre(in.medicoNombre())
                .medicoUid(in.medicoUid())
                .diagnostico(in.diagnostico())
                .estado(EstadoReceta.EMITIDA)
                .controlado(false)
                .build();

        boolean tieneControlado = false;
        for (RecetaInput.DetalleInput d : in.detalles()) {
            Medicamento m = medicamentoRepository.findById(d.medicamentoId())
                    .orElseThrow(() -> new NotFoundException("Medicamento", d.medicamentoId()));
            if (Boolean.TRUE.equals(m.getControlado())) tieneControlado = true;
            DetalleReceta dr = DetalleReceta.builder()
                    .receta(receta).medicamento(m)
                    .cantidad(d.cantidad()).posologia(d.posologia())
                    .build();
            receta.getDetalles().add(dr);
        }
        receta.setControlado(tieneControlado);
        receta = recetaRepository.save(receta);

        if (tieneControlado) {
            try { registrarEnBlockchain(receta); }
            catch (Exception e) { log.warn("Registro blockchain fallo al emitir receta {}: {}", receta.getId(), e.getMessage()); }
        }
        return receta;
    }

    private void registrarEnBlockchain(Receta r) {
        String canonico = canonicalize(r);
        String hashLocal = sha256(canonico);
        r.setHashDocumento(hashLocal);

        BlockchainClient.RegistroBlockchain reg = blockchainClient.registrarReceta(
                canonico, r.getPacienteId().toString(), r.getMedicoUid());
        if (reg != null) {
            r.setBlockchainTx(reg.txHash());
            r.setBlockchainId(reg.blockchainId());
        }
        recetaRepository.save(r);
    }

    private String canonicalize(Receta r) {
        String items = r.getDetalles().stream()
                .map(d -> d.getMedicamento().getId() + ":" + d.getCantidad())
                .sorted().collect(Collectors.joining(","));
        return "{paciente:" + r.getPacienteId() + ",medico:" + r.getMedicoUid()
                + ",fecha:" + r.getFechaEmision() + ",items:[" + items + "]}";
    }

    public static String sha256(String input) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] digest = md.digest(input.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(digest);
        } catch (Exception e) {
            throw new IllegalStateException("SHA-256 no disponible", e);
        }
    }

    public VerificacionReceta verificarReceta(UUID id) {
        Receta r = findById(id);
        if (r.getHashDocumento() == null) {
            return VerificacionReceta.notFound("Receta sin registro blockchain");
        }
        Map<String, Object> resp = blockchainClient.verificarHash(r.getHashDocumento());
        if (resp == null) return VerificacionReceta.notFound("Sin respuesta de ms-blockchain");
        Boolean exists = (Boolean) resp.getOrDefault("exists", false);
        Long bcId = toLong(resp.get("id"));
        Long ts = toLong(resp.get("timestamp"));
        Long bn = toLong(resp.get("blockNumber"));
        String err = (String) resp.get("error");
        return new VerificacionReceta(exists, bcId, ts, bn, null, err);
    }

    private static Long toLong(Object o) {
        if (o == null) return null;
        if (o instanceof Number n) return n.longValue();
        try { return Long.valueOf(o.toString()); } catch (Exception e) { return null; }
    }

    /**
     * Reintenta el registro en blockchain para recetas controladas que aun no tienen txHash.
     * Corre cada minuto.
     */
    @Scheduled(fixedDelay = 60_000, initialDelay = 30_000)
    @Transactional
    public void reintentarBlockchainPendientes() {
        // Pendiente = no tiene id on-chain (blockchainId IS NULL).
        // Una receta con blockchainId pero sin txHash YA esta on-chain (caso
        // idempotente: el server reconocio que el hash ya existia).
        List<Receta> pendientes = recetaRepository.findByControladoTrueAndBlockchainIdIsNull();
        if (pendientes.isEmpty()) return;
        log.info("Reintentando registro blockchain de {} recetas pendientes", pendientes.size());
        for (Receta r : pendientes) {
            try { registrarEnBlockchain(r); }
            catch (Exception e) { log.warn("Reintento fallo para receta {}: {}", r.getId(), e.getMessage()); }
        }
    }
}
