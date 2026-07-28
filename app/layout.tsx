import type { Metadata } from 'next';
import './globals.css';
import Nav from '@/components/nav';

export const metadata: Metadata = {
  title: 'Ngân hàng câu hỏi',
  description: 'Quản lý câu hỏi và trộn đề ôn tập'
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="vi">
      <body className="min-h-screen bg-gray-50 text-gray-900">
        <Nav />
        <main className="max-w-6xl mx-auto p-6">{children}</main>
      </body>
    </html>
  );
}
