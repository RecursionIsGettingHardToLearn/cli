/**
 * Configuracion de PRODUCCION.
 *
 * Reemplaza placeholders con los valores reales antes de `ng build --prod`.
 * Considera inyectar estos valores en build time desde CI/CD (GitHub Actions,
 * Azure DevOps, etc.) en vez de hardcodearlos en este archivo.
 */
export const environment = {
  production: true,
  graphqlUrl: 'https://rr-rho-jade.vercel.app/api/graphql',
  ms2Url: 'https://ms-diagnostico-ia.onrender.com',
  blockchainUrl: 'https://rr-ch3a.onrender.com',
  supabase: {
    url: 'https://yiyfwfvxdseamnelgetf.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlpeWZ3ZnZ4ZHNlYW1uZWxnZXRmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5NTU4MzAsImV4cCI6MjA5NTUzMTgzMH0.oD57Pm5qYafxeB5a9u_z6IW7V7fVypD5gmkUfsmikLg'
  }
};
