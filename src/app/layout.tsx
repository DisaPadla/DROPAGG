import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import Navbar from "@/components/Navbar";
import { LanguageProvider } from "@/context/language-context";
import { PwaRegister } from "@/components/pwa-register";

const inter = Inter({ subsets: ["latin", "cyrillic"] });

export const metadata: Metadata = {
  title: "DropAgg | Агрегатор стрітвір та брендового одягу",
  description: "Відстежуйте дропи, нові колекції та наявність розмірів у магазинах одягу.",
  manifest: "/manifest.json",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="uk">
      <head>
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <link rel="apple-touch-icon" href="/logo.svg" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#09090b" />
      </head>
      <body className={`${inter.className} min-h-screen flex flex-col`}>
        <LanguageProvider>
          <PwaRegister />
          <Suspense fallback={<nav className="sticky top-0 z-50 w-full h-16 border-b bg-background" />}>
            <Navbar />
          </Suspense>
          <main className="flex-1">
            <Suspense fallback={null}>
              {children}
            </Suspense>
          </main>
        </LanguageProvider>
      </body>
    </html>
  );
}
