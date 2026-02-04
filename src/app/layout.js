import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "CircuitVision AI - Documentation Hardware Automatique | Gemini 3",
  description: "Générez documentation technique complète, détectez bugs hardware et créez shopping lists en < 30 secondes avec Gemini 3. Économisez 95% de votre temps sur vos projets embarqués.",
  keywords: [
    "circuit documentation",
    "hardware analysis",
    "embedded systems",
    "ESP32",
    "Arduino",
    "Raspberry Pi",
    "bug detection",
    "Gemini 3",
    "AI documentation",
    "IoT",
    "electronics",
    "PCB design"
  ].join(", "),
  authors: [{ name: "CircuitVision AI Team" }],
  creator: "CircuitVision AI",
  publisher: "CircuitVision AI",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
    },
  },
  openGraph: {
    title: "CircuitVision AI - Documentation Hardware en 25 secondes",
    description: "Bug detection automatique + Shopping list + Documentation complète avec Gemini 3",
    url: "https://circuitvision.ai",
    siteName: "CircuitVision AI",
    locale: "fr_FR",
    type: "website",
    images: [
      {
        url: "/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "CircuitVision AI - Documentation Hardware Automatique",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "CircuitVision AI - Documentation Hardware en 25 secondes",
    description: "Bug detection automatique + Shopping list + Documentation complète",
    creator: "@circuitvision",
    images: ["/og-image.jpg"],
  },
  verification: {
    // google: 'your-google-verification-code',
    // yandex: 'your-yandex-verification-code',
  },
  category: "technology",
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <head>
        {/* Preconnect pour optimiser le chargement */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        
        {/* Favicon (ajouter ces fichiers dans /public) */}
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
        
        {/* Theme color */}
        <meta name="theme-color" content="#3B82F6" />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}
        
        {/* Google Analytics (optionnel - décommenter et ajouter ton ID) */}
        {/* <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-XXXXXXXXXX');
          `}
        </Script> */}
      </body>
    </html>
  );
}