import type {Metadata} from 'next';
import { Inter, JetBrains_Mono, Outfit } from 'next/font/google';
import { AppProvider } from '@/context/AppContext';
import './globals.css'; // Global styles

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
});

const display = Outfit({
  subsets: ['latin'],
  variable: '--font-display',
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
});

export const metadata: Metadata = {
  title: 'Plack',
  description: 'A premium, futuristic, minimal AI assistant.',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html lang="en" className={`${inter.variable} ${display.variable} ${mono.variable}`}>
      <body suppressHydrationWarning className="bg-slate-50/30 font-sans">
        <AppProvider>
          {children}
        </AppProvider>
      </body>
    </html>
  );
}

