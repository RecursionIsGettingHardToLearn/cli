package com.clinica.gestion.bi;

import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.graphql.data.method.annotation.Argument;
import org.springframework.graphql.data.method.annotation.QueryMapping;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.stereotype.Controller;

import java.time.LocalDate;
import java.util.List;

@Controller
@RequiredArgsConstructor
public class BiController {

    private final VentaDiariaRepository ventasDiariasRepo;
    private final TopMedicamentoRepository topMedicamentosRepo;
    private final InventarioCriticoRepository inventarioRepo;
    private final RecetaBlockchainRepository recetasBlockchainRepo;

    @QueryMapping
    @PreAuthorize("hasRole('ADMINISTRADOR')")
    public List<VentaDiariaPoint> biVentasDiarias(@Argument LocalDate desde, @Argument LocalDate hasta) {
        return ventasDiariasRepo.findRange(desde, hasta);
    }

    @QueryMapping
    @PreAuthorize("hasRole('ADMINISTRADOR')")
    public List<TopMedicamentoItem> biTopMedicamentos(@Argument Integer limit) {
        int n = limit == null || limit <= 0 ? 10 : Math.min(limit, 100);
        return topMedicamentosRepo.findAll(PageRequest.of(0, n,
                Sort.by(Sort.Direction.DESC, "unidadesVendidas"))).getContent();
    }

    @QueryMapping
    @PreAuthorize("hasRole('ADMINISTRADOR')")
    public List<InventarioCriticoItem> biInventarioCritico() {
        return inventarioRepo.findAll(Sort.by(Sort.Direction.ASC, "stockActual"));
    }

    @QueryMapping
    @PreAuthorize("hasRole('ADMINISTRADOR')")
    public List<RecetaBlockchainPoint> biRecetasBlockchain(@Argument LocalDate desde, @Argument LocalDate hasta) {
        return recetasBlockchainRepo.findRange(desde, hasta);
    }
}
