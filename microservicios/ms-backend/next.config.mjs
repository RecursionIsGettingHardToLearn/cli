/** @type {import('next').NextConfig} */
const nextConfig = {
  // MS1 es backend puro: solo route handlers bajo src/app/api/*. Sin UI/paginas.
  // GraphQL en /api/graphql, REST interno en /api/internal/*.
};

export default nextConfig;
