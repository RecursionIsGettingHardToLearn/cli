const fs = require('fs');

const targetPath = './src/environments/environment.prod.ts';

const envConfigFile = `export const environment = {
  production: true,
  graphqlUrl: '${process.env.GRAPHQL_URL || 'http://localhost:3000/api/graphql'}',
  ms2Url: '${process.env.MS2_URL || 'http://localhost:8000'}',
  blockchainUrl: '${process.env.BLOCKCHAIN_URL || 'http://localhost:3001'}',
  supabase: {
    url: '${process.env.SUPABASE_URL || ''}',
    anonKey: '${process.env.SUPABASE_ANON_KEY || ''}'
  }
};
`;

fs.writeFileSync(targetPath, envConfigFile);
console.log(`[Angular] environment.prod.ts generado exitosamente con variables de entorno de Vercel`);
