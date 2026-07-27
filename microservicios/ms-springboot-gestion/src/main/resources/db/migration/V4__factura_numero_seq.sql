-- ============================================================
-- Correlativo de facturas a prueba de choques.
--
-- PROBLEMA: generarNumero() usaba facturaRepository.count() + 1. Como los
-- numeros sembrados van de F-2026-000010 a F-2026-000039 (30 filas, del 10
-- al 39), count()+1 = 31 caia en un numero YA existente -> violacion de
-- unique (factura_numero_key) -> rollback -> la venta no se guardaba.
-- Ademas count()+1 tiene condicion de carrera con ventas simultaneas.
--
-- SOLUCION: una secuencia dedicada. nextval() nunca repite un valor y NO se
-- revierte con la transaccion (si una venta falla, el numero se "quema" y
-- deja un hueco, pero jamas se reutiliza -> imposible que choque).
-- ============================================================

CREATE SEQUENCE IF NOT EXISTS factura_numero_seq;

-- Alinear la secuencia al maximo correlativo ya existente + 1.
-- split_part('F-2026-000039', '-', 3) = '000039' -> 39 ; siguiente = 40.
-- is_called = false hace que el PRIMER nextval() devuelva exactamente ese valor.
SELECT setval(
    'factura_numero_seq',
    COALESCE((SELECT MAX(split_part(numero, '-', 3)::bigint) FROM factura), 0) + 1,
    false
);
