import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bunkd - Find Your Perfect Roommate",
  description: "The easiest way to find roommates and housing",
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
