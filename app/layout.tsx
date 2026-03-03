import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import { ThemeProvider } from "@/components/theme/provider";
import { LocaleProvider } from "@/components/locale/provider";
import { getTheme } from "@/utils/theme";
import { getLocale } from "@/utils/locale";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Walty",
  description: "Ethereum wallet",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Reading headers makes this layout dynamic per-request so Next.js
  // picks up the x-nonce set by middleware and applies it to RSC inline scripts.
  await headers();
  const theme = await getTheme();
  const locale = await getLocale();

  return (
    <html lang={locale} className={theme} suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <ThemeProvider initialTheme={theme}>
          <LocaleProvider initialLocale={locale}>
            {children}
          </LocaleProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
