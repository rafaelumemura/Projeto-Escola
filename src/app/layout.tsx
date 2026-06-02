import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { ThemeProvider } from "@/components/theme/ThemeProvider";

export const metadata: Metadata = {
  title: "Projeto Escola",
  description: "App para gerar atividades pedagógicas personalizadas com IA.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/simbolo.webp",
    shortcut: "/simbolo.webp",
    apple: "/simbolo.webp"
  }
};

export const viewport: Viewport = {
  themeColor: "#2f7d58",
  width: "device-width",
  initialScale: 1
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>
        <AuthProvider>
          <ThemeProvider>
            {children}
            <ServiceWorkerRegister />
          </ThemeProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
