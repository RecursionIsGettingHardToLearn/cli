-- =====================================================
--  Vistas para el Dashboard de BI (Business Intelligence)
-- =====================================================

-- 1) Inventario Critico
DROP VIEW IF EXISTS vw_inventario_critico;
CREATE VIEW vw_inventario_critico AS
SELECT 
    m.id AS medicamento_id,
    m.nombre AS medicamento,
    m.stock_minimo,
    COALESCE(SUM(l.cantidad_actual), 0) AS stock_actual,
    CASE
        WHEN COALESCE(SUM(l.cantidad_actual), 0) = 0 THEN 'SIN_STOCK'
        WHEN COALESCE(SUM(l.cantidad_actual), 0) <= m.stock_minimo THEN 'CRITICO'
        WHEN COALESCE(SUM(l.cantidad_actual), 0) <= m.stock_minimo * 2 THEN 'BAJO'
        ELSE 'OK'
    END AS nivel
FROM medicamento m
LEFT JOIN lote l ON m.id = l.medicamento_id
GROUP BY m.id, m.nombre, m.stock_minimo;


-- 2) Ventas Diarias
DROP VIEW IF EXISTS vw_ventas_diarias;
CREATE VIEW vw_ventas_diarias AS
SELECT 
    DATE(f.fecha) AS dia,
    COUNT(f.id) AS num_facturas,
    COALESCE(SUM(f.total), 0) AS total_vendido,
    CASE 
        WHEN COUNT(f.id) > 0 THEN COALESCE(SUM(f.total), 0) / COUNT(f.id) 
        ELSE 0 
    END AS ticket_promedio
FROM factura f
WHERE f.estado = 'PAGADA'
GROUP BY DATE(f.fecha);


-- 3) Top Medicamentos
DROP VIEW IF EXISTS vw_top_medicamentos;
CREATE VIEW vw_top_medicamentos AS
SELECT 
    m.id AS medicamento_id,
    m.nombre AS medicamento,
    COALESCE(SUM(df.cantidad), 0) AS unidades_vendidas,
    COALESCE(SUM(df.subtotal), 0) AS monto_total,
    COUNT(DISTINCT df.factura_id) AS num_facturas
FROM medicamento m
JOIN detalle_factura df ON m.id = df.medicamento_id
JOIN factura f ON df.factura_id = f.id
WHERE f.estado = 'PAGADA'
GROUP BY m.id, m.nombre;
