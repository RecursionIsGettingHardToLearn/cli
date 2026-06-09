require('@nomicfoundation/hardhat-toolbox');
require('dotenv').config();

const { PRIVATE_KEY, AMOY_RPC_URL, POLYGONSCAN_API_KEY } = process.env;

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: '0.8.20',
    settings: {
      optimizer: { enabled: true, runs: 200 }
    }
  },
  networks: {
    // Red EN MEMORIA, usada UNICAMENTE por `npx hardhat test`.
    // Ya no exponemos una red `localhost` (nodo `hardhat node`): el runtime de
    // la app apunta siempre a Polygon Amoy.
    hardhat: {
      chainId: 31337
    },
    amoy: {
      url: AMOY_RPC_URL || 'https://rpc-amoy.polygon.technology',
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
      chainId: 80002
    }
  },
  etherscan: {
    apiKey: {
      polygonAmoy: POLYGONSCAN_API_KEY || ''
    },
    customChains: [
      {
        network: 'polygonAmoy',
        chainId: 80002,
        urls: {
          apiURL: 'https://api-amoy.polygonscan.com/api',
          browserURL: 'https://amoy.polygonscan.com'
        }
      }
    ]
  },
  paths: {
    sources: './contracts',
    tests: './test',
    artifacts: './artifacts',
    cache: './cache'
  }
};
