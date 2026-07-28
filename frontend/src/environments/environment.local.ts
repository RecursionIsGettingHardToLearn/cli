/**
 * Configuracion LOCAL de desarrollo con credenciales reales.
 * Este archivo esta gitignored: NUNCA se versiona.
 *
 * Se inyecta en lugar de environment.ts mediante fileReplacements en angular.json
 * (configuracion "development").
 */
export const environment = {
  production: false,
  graphqlUrl: 'http://localhost:3000/api/graphql',
  ms2Url: 'http://localhost:8000',
  blockchainUrl: 'http://localhost:3001',
  supabase: {
    url: 'https://krrfinxcfahnqbjxzebr.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtycmZpbnhjZmFobnFianh6ZWJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM4ODg0MjksImV4cCI6MjA5OTQ2NDQyOX0.z3rMtKROfOcC3IriksAmk8VDsaRv1HT0cu_IDdcK5yg'
  }
};
