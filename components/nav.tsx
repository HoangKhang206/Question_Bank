'use client';

import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/chapters', label: 'Bank', exact: false },
  { href: '/exam/new', label: 'Tạo đề', exact: false },
  { href: '/exams', label: 'Lịch sử', exact: false },
];

export default function Nav() {
  const pathname = usePathname();

  function isActive(href: string, exact: boolean) {
    return exact ? pathname === href : pathname.startsWith(href);
  }

  return (
    <nav className="bg-white border-b">
      <div className="max-w-6xl mx-auto px-6 py-3 flex gap-6 items-center">
        <a href="/" className="-ml-4 shrink-0">
          <img src="/logo.png" alt="Logo" className="h-20 w-auto object-contain" />
        </a>
        {LINKS.map(({ href, label, exact }) => (
          <a
            key={href}
            href={href}
            className={
              isActive(href, exact)
                ? 'font-bold text-sm'
                : 'text-sm text-gray-500 hover:text-gray-900'
            }
          >
            {label}
          </a>
        ))}
        <form action="/api/auth/logout" method="post" className="ml-auto">
          <button className="text-sm text-gray-500 hover:underline">Đăng xuất</button>
        </form>
      </div>
    </nav>
  );
}
