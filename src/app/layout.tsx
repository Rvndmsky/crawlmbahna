import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MBAHNA - Website Untuk Keamanan NKRI",
  description: "Monitoring intelijen OSINT — politik & pemerintahan Indonesia",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('theme')||'dark';document.documentElement.setAttribute('data-theme',t);}catch(e){}`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
