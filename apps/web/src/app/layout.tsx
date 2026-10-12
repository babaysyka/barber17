import type { Metadata } from "next";
import { Bodoni_Moda, Host_Grotesk } from "next/font/google";
import { SmoothScroll } from "@/components/scroll/SmoothScroll";
import "./globals.css";

const sans = Host_Grotesk({
  subsets: ["latin"],
  weight: "variable",
  display: "swap",
  variable: "--font-sans",
});

const display = Bodoni_Moda({
  subsets: ["latin"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  display: "swap",
  variable: "--font-display",
});

export const metadata: Metadata = {
  title: "Orda — men's grooming, Tashkent",
  description:
    "Premium men's grooming on Shota Rustaveli. Classic cuts, fades, beard design, and a quiet room in the centre of Tashkent.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`}>
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        <SmoothScroll>{children}</SmoothScroll>
      </body>
    </html>
  );
}
