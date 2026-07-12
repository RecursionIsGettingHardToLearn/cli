-- =====================================================
--  Vista adicional para el Dashboard de BI: Blockchain
-- =====================================================

CREATE OR REPLACE VIEW vw_recetas_blockchain AS
SELECT 
    DATE_TRUNC('month', r.fecha_emision)::DATE AS mes,
    COUNT(r.id) AS total_recetas,
    SUM(CASE WHEN r.blockchain_tx IS NOT NULL THEN 1 ELSE 0 END) AS registradas_en_blockchain,
    SUM(CASE WHEN r.controlado = true THEN 1 ELSE 0 END) AS controladas,
    SUM(CASE WHEN r.estado = 'DISPENSADA' THEN 1 ELSE 0 END) AS dispensadas
FROM receta r
GROUP BY DATE_TRUNC('month', r.fecha_emision)::DATE;
