import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
import { ThemeProvider } from "@/components/theme/provider";
import { LocaleProvider } from "@/components/locale/provider";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { LoadingScreen } from "@/components/LoadingScreen";
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
  icons: {
    icon: [
      { url: "/favicon-16x16.png", type: "image/png", sizes: "16x16" },
      { url: "/favicon-32x32.png", type: "image/png", sizes: "32x32" },
      { url: "/android-chrome-192x192.png", type: "image/png", sizes: "192x192" },
      { url: "/android-chrome-512x512.png", type: "image/png", sizes: "512x512" },
      { url: "/favicon.ico", type: "image/x-icon" },
    ],
    shortcut: { url: "/favicon-16x16.png", type: "image/png", sizes: "16x16" },
    apple: { url: "/apple-touch-icon.png", type: "image/png", sizes: "180x180" },
  },
  manifest: "/site.webmanifest",
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
    <html lang={locale} className={theme === "dark" ? "dark" : ""} suppressHydrationWarning>
      <body
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <LoadingScreen />
        <QueryProvider>
          <ThemeProvider initialTheme={theme}>
            <LocaleProvider initialLocale={locale}>
              {children}
            </LocaleProvider>
          </ThemeProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
