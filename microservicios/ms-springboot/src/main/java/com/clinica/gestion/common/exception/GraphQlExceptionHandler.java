package com.clinica.gestion.common.exception;

import graphql.GraphQLError;
import graphql.GraphqlErrorBuilder;
import graphql.schema.DataFetchingEnvironment;
import org.springframework.graphql.execution.DataFetcherExceptionResolverAdapter;
import org.springframework.graphql.execution.ErrorType;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.stereotype.Component;

import java.io.PrintWriter;
import java.io.StringWriter;
import java.util.HashMap;
import java.util.Map;

/**
 * Mapea excepciones de los data fetchers a errores GraphQL.
 *
 * Para las excepciones NO contempladas ya no delegamos al handler por defecto
 * de Spring (que enmascara todo como "INTERNAL_ERROR for <id>"): devolvemos el
 * error COMPLETO — clase, mensaje, causa y stacktrace — en las extensions, para
 * que el cliente vea el detalle real del fallo.
 */
@Component
public class GraphQlExceptionHandler extends DataFetcherExceptionResolverAdapter {

    @Override
    protected GraphQLError resolveToSingleError(Throwable ex, DataFetchingEnvironment env) {
        if (ex instanceof NotFoundException) {
            return build(ex, env, ErrorType.NOT_FOUND);
        }
        if (ex instanceof BusinessException) {
            return build(ex, env, ErrorType.BAD_REQUEST);
        }
        if (ex instanceof AccessDeniedException) {
            return build(ex, env, ErrorType.FORBIDDEN);
        }
        if (ex instanceof AuthenticationException) {
            return build(ex, env, ErrorType.UNAUTHORIZED);
        }
        if (ex instanceof IllegalArgumentException) {
            return build(ex, env, ErrorType.BAD_REQUEST);
        }
        // Excepcion no contemplada: en vez de devolver null (lo que activa el
        // enmascaramiento por defecto), exponemos el error COMPLETO.
        return buildFull(ex, env);
    }

    private GraphQLError build(Throwable ex, DataFetchingEnvironment env, ErrorType type) {
        return GraphqlErrorBuilder.newError(env)
                .errorType(type)
                .message(ex.getMessage())
                .extensions(details(ex))
                .build();
    }

    private GraphQLError buildFull(Throwable ex, DataFetchingEnvironment env) {
        String msg = ex.getMessage() != null ? ex.getMessage() : ex.toString();
        return GraphqlErrorBuilder.newError(env)
                .errorType(ErrorType.INTERNAL_ERROR)
                .message(ex.getClass().getName() + ": " + msg)
                .extensions(details(ex))
                .build();
    }

    /** Detalle completo del error (clase, mensaje, causa y stacktrace) para las extensions. */
    private Map<String, Object> details(Throwable ex) {
        Map<String, Object> m = new HashMap<>();
        m.put("exception", ex.getClass().getName());
        m.put("detail", ex.getMessage());

        StringWriter sw = new StringWriter();
        ex.printStackTrace(new PrintWriter(sw));
        m.put("stacktrace", sw.toString());

        Throwable cause = ex.getCause();
        if (cause != null && cause != ex) {
            m.put("cause", cause.getClass().getName() + ": " + cause.getMessage());
        }
        return m;
    }
}
