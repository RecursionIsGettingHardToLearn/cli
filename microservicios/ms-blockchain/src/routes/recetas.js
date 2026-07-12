const express = require('express');
const blockchain = require('../services/blockchainService');
const auth = require('../middleware/auth');
const { errorDetails } = require('../utils/errorDetails');

const router = express.Router();

/**
 * POST /recetas
 * body: { documentoTexto, pacienteId, medicoUid }
 * Solo MEDICO o ADMINISTRADOR
 */
router.post('/', auth({ roles: ['MEDICO', 'ADMINISTRADOR'] }), async (req, res) => {
  try {
    const { documentoTexto, pacienteId, medicoUid } = req.body || {};
    if (!documentoTexto || !pacienteId || !medicoUid) {
      return res.status(400).json({ error: 'Faltan documentoTexto/pacienteId/medicoUid' });
    }
    const result = await blockchain.registrar(documentoTexto, pacienteId, medicoUid);
    res.json(result);
  } catch (e) {
    console.error('Error en POST /recetas:', e);
    res.status(500).json(errorDetails(e));
  }
});

/**
 * POST /recetas/estimar
 * body: { documentoTexto, pacienteId, medicoUid }
 * Estima el costo en POL de registrar ESE documento, SIN enviar la transaccion.
 * Si el hash ya esta on-chain devuelve yaRegistrado=true y costo 0.
 * Mismos inputs y roles que POST /recetas (solo MEDICO o ADMINISTRADOR).
 */
router.post('/estimar', auth({ roles: ['MEDICO', 'ADMINISTRADOR'] }), async (req, res) => {
  try {
    const { documentoTexto, pacienteId, medicoUid } = req.body || {};
    if (!documentoTexto || !pacienteId || !medicoUid) {
      return res.status(400).json({ error: 'Faltan documentoTexto/pacienteId/medicoUid' });
    }
    const result = await blockchain.estimarGasRegistro({ documentoTexto, pacienteId, medicoUid });
    res.json(result);
  } catch (e) {
    console.error('Error en POST /recetas/estimar:', e);
    res.status(500).json(errorDetails(e));
  }
});

/**
 * GET /recetas/gas
 * Costo estimado (representativo) de registrar una receta NUEVA al precio de gas
 * actual de Amoy, mas el saldo del firmante y cuantas registraciones alcanzan.
 * No registra nada. Cualquier rol autenticado.
 */
router.get('/gas', auth(), async (req, res) => {
  try {
    const result = await blockchain.estimarGasRegistro();
    res.json(result);
  } catch (e) {
    console.error('Error en GET /recetas/gas:', e);
    res.status(500).json(errorDetails(e));
  }
});

/**
 * GET /recetas/verificar?hash=...
 * Cualquier rol autenticado.
 */
router.get('/verificar', auth(), async (req, res) => {
  const { hash } = req.query;
  console.log(`[verificar] hash recibido: "${hash}" (len=${(hash || '').length})`);
  try {
    if (!hash) return res.status(400).json({ error: 'Falta query param ?hash=' });
    const result = await blockchain.verificarPorHash(String(hash));
    console.log(`[verificar] resultado:`, result);
    res.json(result);
  } catch (e) {
    console.error('Error en GET /recetas/verificar:', e);
    // Si fallo por hash mal formado o contrato, devolvemos exists=false con el
    // error COMPLETO (mensaje + stack + campos) en lugar de 500 — el frontend
    // lo trata mejor y ahora ve el detalle real del fallo.
    res.json({ exists: false, ...errorDetails(e) });
  }
});

/**
 * GET /recetas/paciente/:id
 * Roles permitidos por defecto, sin filtro adicional aqui (ms-gestion ya filtra).
 */
router.get('/paciente/:id', auth(), async (req, res) => {
  try {
    const indices = await blockchain.recetasDe(req.params.id);
    res.json({ pacienteId: req.params.id, indices });
  } catch (e) {
    console.error('Error en GET /recetas/paciente/:id:', e);
    res.status(500).json(errorDetails(e));
  }
});

module.exports = router;
