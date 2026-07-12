/** @type {import('next').NextConfig} */
const nextConfig = {
  // MS1 es backend puro: solo route handlers bajo src/app/api/*. Sin UI/paginas.
  // GraphQL en /api/graphql, REST interno en /api/internal/*.
  // "standalone" genera un servidor autocontenido en .next/standalone,
  // necesario para la imagen Docker ligera que se despliega en AKS.
  output: "standalone",
};

export default nextConfig;
