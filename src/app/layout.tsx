import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster as SonnerToaster } from "@/components/ui/sonner";
import { ThemeProvider } from "next-themes";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "EduTECH ESEN · Gestión de Voluntarios y Horas Sociales",
  description:
    "Plataforma de gestión de voluntarios, comités, actividades, horas sociales, clases e ingresos de la asociación EduTECH ESEN.",
  keywords: [
    "EduTECH",
    "ESEN",
    "voluntarios",
    "horas sociales",
    "gestión asociaciones",
  ],
  authors: [{ name: "EduTECH ESEN" }],
  icons: {
    icon: [
      { url: "/EduTech_LogoConNombre.png", type: "image/png", sizes: "2048x2048" },
    ],
    apple: [
      { url: "/EduTech_LogoConNombre.png", type: "image/png", sizes: "2048x2048" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <SonnerToaster position="top-right" richColors closeButton />
        </ThemeProvider>
      </body>
    </html>
  );
}
