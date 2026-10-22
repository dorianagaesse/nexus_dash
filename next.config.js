/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // Next 16.4 type-checks every tsconfig include during build. Keep tests
    // (which pass plain-object route params) out of the production build.
    tsconfigPath: "./tsconfig.build.json",
  },
};

module.exports = nextConfig;

