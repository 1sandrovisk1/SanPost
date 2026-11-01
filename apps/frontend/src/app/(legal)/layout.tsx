import { ReactNode } from 'react';
import '../global.scss';
import { jakartaSans } from '@gitroom/frontend/fonts/plus-jakarta-sans/plus.jakarta.sans.font';

export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className={jakartaSans.className}>{children}</body>
    </html>
  );
}
