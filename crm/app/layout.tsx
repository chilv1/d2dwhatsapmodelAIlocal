import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Telecom Big — Campaign CRM',
  description: 'Hệ thống quản lý campaign cho Telecom Big Peru',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
