require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const blockchain = require('./services/blockchainService');
const recetasRouter = require('./routes/recetas');
const { errorDetails } = require('./utils/errorDetails');

const app = express();

// CORS_ORIGINS admite comodines (*) para dominios rotativos, p.ej. los deploys
// de Vercel: "https://*-mat2346s-projects.vercel.app". Cada * cubre un segmento
// alfanumerico (letras, numeros y guiones), nunca puntos.
const allowList = (process.env.CORS_ORIGINS || 'http://localhost:4200,http://localhost:8080')
  .split(',').map(o => o.trim()).filter(Boolean);

function originPermitido(origin) {
  return allowList.some(entry => {
    if (!entry.includes('*')) return entry === origin;
    const regex = new RegExp(
      '^' + entry.split('*').map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[A-Za-z0-9-]+') + '$',
      'i'
    );
    return regex.test(origin);
  });
}

app.use(cors({
  origin: (origin, cb) => cb(null, !origin || originPermitido(origin)),
  credentials: true,
  allowedHeaders: ['Authorization', 'Content-Type']
}));
app.use(express.json({ limit: '1mb' }));
app.use(morgan('dev'));

app.get('/health', async (req, res) => {
  try {
    const info = blockchain.ready() ? await blockchain.networkInfo() : { ready: false };
    res.json({ status: 'OK', service: 'ms-blockchain', ...info });
  } catch (e) {
    res.json({ status: 'DEGRADED', service: 'ms-blockchain', ...errorDetails(e) });
  }
});

app.use('/recetas', recetasRouter);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(err.status || err.statusCode || 500).json(errorDetails(err));
});

const port = process.env.PORT || 3001;
app.listen(port, () => {
  console.log(`ms-blockchain escuchando en :${port}`);
  console.log(`  contractAddress=${blockchain.contractAddress || '(no definido)'}`);
  console.log(`  network=${blockchain.rpcUrl} (Polygon Amoy testnet)`);
  console.log(`  auth=${process.env.SUPABASE_JWKS_URI ? 'JWKS' : 'DEV (sin auth)'}`);
});
