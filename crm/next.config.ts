import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev indicator (icon "N" góc màn hình) mặc định bottom-left → đụng "Đăng xuất" trong sidebar.
  // Chuyển sang bottom-right để không che layout.
  devIndicators: {
    position: 'bottom-right',
  },
};

export default nextConfig;
