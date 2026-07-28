/**
 * Configuracion de PRODUCCION.
 *
 * Reemplaza placeholders con los valores reales antes de `ng build --prod`.
 * Considera inyectar estos valores en build time desde CI/CD (GitHub Actions,
 * Azure DevOps, etc.) en vez de hardcodearlos en este archivo.
 */
export const environment = {
  production: true,
  // AKS: el frontend se sirve desde el MISMO ingress que las APIs
  // (rutas relativas al mismo origen => sin CORS).
  graphqlUrl: '/api/graphql',
  ms2Url: '/ia',
  blockchainUrl: '/blockchain',
  supabase: {
    url: 'https://krrfinxcfahnqbjxzebr.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtycmZpbnhjZmFobnFianh6ZWJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM4ODg0MjksImV4cCI6MjA5OTQ2NDQyOX0.z3rMtKROfOcC3IriksAmk8VDsaRv1HT0cu_IDdcK5yg'
  }
};
