import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // STANDALONE=1 (ตั้งโดย scripts/package-windows.sh) = build แบบรันเองได้ทั้งชุด สำหรับเครื่องแม่ที่หน้างาน
  ...(process.env.STANDALONE === '1' ? { output: 'standalone' as const } : {}),
  // ตัวเชื่อม SQL Server ใช้ความสามารถของ Node.js โดยตรง ไม่ต้อง bundle
  serverExternalPackages: ['mssql', 'tedious'],
  // สคริปต์สร้าง/อัปเดตตาราง ที่โปรแกรมรันเองตอนเปิด (src/server/db.ts) ต้องติดไปกับชุดติดตั้ง
  outputFileTracingIncludes: {
    '/*': ['./database/*.sql'],
  },
};

export default nextConfig;
