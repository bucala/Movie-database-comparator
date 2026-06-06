import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "TMDb → ČSFD Matcher",
  description: "Nástroj na párovanie TMDb exportu s ČSFD odkazmi. Nahraj CSV alebo JSON, spusti automatické vyhľadávanie a exportuj obohatený súbor.",
  openGraph: {
    title: "TMDb → ČSFD Matcher",
    description: "Páruj TMDb filmy s ČSFD odkazmi jedným kliknutím.",
    type: "website"
  }
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="sk" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function(){
                try {
                  var t = localStorage.getItem('theme');
                  var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                  var theme = (t === 'light' || t === 'dark') ? t : (prefersDark ? 'dark' : 'light');
                  document.documentElement.setAttribute('data-theme', theme);
                  document.documentElement.classList.toggle('dark', theme === 'dark');
                } catch(e) {}
              })()
            `
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
