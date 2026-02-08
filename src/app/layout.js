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
  title: "CircuitVision AI - Automated Hardware Documentation | Gemini 2.5",
  description:
    "Generate complete technical documentation, detect hardware bugs, and create shopping lists in under 30 seconds with Gemini 2.5. Save 95% of your time on embedded projects.",
  keywords: [
    "circuit documentation",
    "hardware analysis",
    "embedded systems",
    "ESP32",
    "Arduino",
    "Raspberry Pi",
    "bug detection",
    "Gemini 2.5",
    "AI documentation",
    "IoT",
    "electronics",
    "PCB design",
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
    title: "CircuitVision AI - Automated Hardware Documentation in 25 seconds",
    description: "Automatic bug detection + Shopping list + Complete documentation with Gemini 2.5",
    url: "https://circuitvision.ai",
    siteName: "CircuitVision AI",
    locale: "en_US",
    type: "website",
    images: [
      {
        url: "/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "CircuitVision AI - Automated Hardware Documentation",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "CircuitVision AI - Automated Hardware Documentation in 25 seconds",
    description: "Automatic bug detection + Shopping list + Complete documentation",
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
    <html lang="en">
      <head>
        {/* Preconnect for optimized loading */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />

        {/* Favicon */}
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />

        {/* Theme color */}
        <meta name="theme-color" content="#3B82F6" />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        {children}

        {/* Google Analytics (optional - uncomment and add your ID) */}
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
