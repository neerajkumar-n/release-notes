import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'Hyperswitch Releases',
  description: 'Weekly release notes for Hyperswitch.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
