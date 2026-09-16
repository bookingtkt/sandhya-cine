import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Ambadi 2k Cinemas — Book Tickets",
  description: "Movie ticket booking"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <div className="mx-auto w-full max-w-3xl px-3 pb-10">
          <header className="no-print sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-white/10 bg-[#05080c]/95 backdrop-blur">
            <div className="grid h-9 w-9 place-items-center rounded-full bg-brand text-lg text-black">●</div>
            <div className="flex-1">
              <div className="text-lg font-extrabold">Ambadi 2k Cinemas</div>
              <div className="text-xs text-slate-400">Movies • Book Tickets • Enjoy Cinema</div>
            </div>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
