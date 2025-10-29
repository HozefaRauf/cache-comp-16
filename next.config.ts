// Note: Avoid typing NextConfig here so we can use newer options without TS complaints
const nextConfig = {
  // Enable Cache Components
  cacheComponents: true,
  // Fix workspace root inference by explicitly setting the Turbopack root
  // This silences warnings about multiple lockfiles at other locations
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
