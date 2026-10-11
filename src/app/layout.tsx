import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Share Drobe",
  description: "Digitize your closet and borrow from friends.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-cream text-charcoal antialiased min-h-screen flex flex-col`}>
        <main className="flex-1 pb-20">
          {children}
        </main>
      </body>
    </html>
  );
}
