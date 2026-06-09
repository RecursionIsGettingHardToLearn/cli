require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');

const blockchain = require('./services/blockchainService');
const recetasRouter = require('./routes/recetas');
const { errorDetails } = require('./utils/errorDetails');

const app = express();

app.use(cors({
  origin: (process.env.CORS_ORIGINS || 'http://localhost:4200,http://localhost:8080').split(','),
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
