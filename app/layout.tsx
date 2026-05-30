import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Filmová databáza | ČSFD párovanie",
  description: "Interný nástroj na párovanie TMDb exportu s ČSFD odkazmi."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="sk">
      <body>{children}</body>
    </html>
  );
}
