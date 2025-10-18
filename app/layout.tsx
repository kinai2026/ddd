import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { env } from '../lib/env';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'KIN AI Music Generator',
  description: 'Generate songs with AI',
  metadataBase: new URL(env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${inter.className} min-h-screen bg-gray-950 text-gray-100`}>
        <div className="mx-auto max-w-3xl p-6">
          <header className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight">KIN AI Music Generator</h1>
            <p className="mt-2 text-sm text-gray-400">
              Create music from a prompt. This is a skeleton UI. API integration coming soon.
            </p>
          </header>
          <main>{children}</main>
          <footer className="mt-16 text-center text-xs text-gray-500">
            <p>
              Built with Next.js 14, TypeScript, and Tailwind CSS. Placeholder only — no audio is
              generated yet.
            </p>
          </footer>
        </div>
      </body>
    </html>
  );
}
