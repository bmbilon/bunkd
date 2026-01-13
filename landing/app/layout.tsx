import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bunkd - The BS-Meter for the Internet",
  description: "Paste any link. Get a BS score in 2 seconds. With receipts.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
