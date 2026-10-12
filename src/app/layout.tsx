import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Share Drobe",
  description: "Digitize your closet and borrow from friends.",
};

export const viewport: Viewport = {
  themeColor: "#FCFBF7",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-buttercream font-sans text-midnight-slate antialiased">
        {children}
      </body>
    </html>
  );
}
