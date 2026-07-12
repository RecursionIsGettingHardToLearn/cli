package com.clinica.gestion.pago;

import lombok.Getter;
import lombok.Setter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * Configuracion de Stripe (application.yml -> prefijo "stripe", respaldado por
 * variables de entorno STRIPE_*). La SECRET key vive UNICAMENTE en el backend:
 * Angular y la app movil solo reciben la URL de la pagina de Checkout.
 */
@Component
@ConfigurationProperties(prefix = "stripe")
@Getter
@Setter
public class StripeProperties {

    /** sk_test_... (modo test para el parcial). Vacia => pagos online deshabilitados. */
    private String secretKey = "";

    /** whsec_... que entrega `stripe listen`. Vacia => webhook SIN verificar (solo dev). */
    private String webhookSecret = "";

    private String successUrl = "http://localhost:4200/mis-facturas?pago=exito";

    private String cancelUrl = "http://localhost:4200/mis-facturas?pago=cancelado";

    /** Stripe no soporta BOB; en el parcial se usa usd (modo test, dinero ficticio). */
    private String currency = "usd";
}
