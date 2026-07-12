package com.clinica.gestion.common;

import org.springframework.graphql.data.method.annotation.QueryMapping;
import org.springframework.stereotype.Controller;

@Controller
public class HealthController {

    @QueryMapping
    public String health() {
        return "ms-gestion OK";
    }
}
