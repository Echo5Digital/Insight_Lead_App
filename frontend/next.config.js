/** @type {import('next').NextConfig} */
const nextConfig = {
  // Prevent recharts/victory-vendor SSR issues in App Router
  transpilePackages: ['recharts'],

  async rewrites() {
    return [
      {
        source:      '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
