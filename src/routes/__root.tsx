import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import { InteractiveTour, type TourStep } from "@/components/InteractiveTour";
import { usePushNavigation } from "@/hooks/use-push-navigation";
import { HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

import "@/styles.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/ThemeProvider";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  const displayError = error instanceof Error ? error : new Error(String(error));
  console.error("[BOUNDARY ERROR]", error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground Oswald uppercase">
          Ops! Algo deu errado
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          A página não pôde ser carregada. Tente atualizar ou voltar ao início.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-brand-gold px-4 py-2 text-sm font-bold text-brand-blue Oswald uppercase transition-colors hover:bg-brand-gold/90"
          >
            Tentar novamente
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-brand-border bg-brand-surface px-4 py-2 text-sm font-bold text-brand-silver Oswald uppercase transition-colors hover:bg-foreground/5"
          >
            Voltar ao início
          </a>
        </div>
        <div className="mt-8 text-[10px] text-brand-silver/30 font-mono text-left max-h-32 overflow-auto p-2 bg-brand-surface rounded border border-brand-border">
          <p className="font-bold mb-1">[DEBUG INFO]</p>
           <p>Message: {displayError.message}</p>
           <p>Stack: {displayError.stack?.split('\n')[0]}</p>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=5" },
      { title: "SE PASSOU, E PONTO" },
      {
        name: "description",
        content:
          "Entre na lista do SE PASSOU, E PONTO. Vôlei toda Terça, Quarta, Quinta e Sábado em São Paulo.",
      },
      { name: "theme-color", content: "#020817" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Vôlei" },
      { property: "og:title", content: "SE PASSOU, E PONTO" },
      {
        property: "og:description",
        content: "A melhor pelada de vôlei de São Paulo. Terça, Quarta, Quinta e Sábado.",
      },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "SE PASSOU, E PONTO" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "SE PASSOU, E PONTO" },
      { name: "twitter:description", content: "A melhor pelada de vôlei de São Paulo. Terça, Quarta, Quinta e Sábado." },
      { name: "robots", content: "index, follow" },
    ],
    links: [
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon-v3.png" },
      { rel: "icon", type: "image/png", href: "/favicon-v3.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Oswald:wght@500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              try {
                var theme = localStorage.getItem('spp-ui-theme');
                var isDark = theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
                if (isDark) {
                  document.documentElement.classList.add('dark');
                } else {
                  document.documentElement.classList.remove('dark');
                }
              } catch (e) {}
            `,
          }}
        />
      </head>
      <body className="bg-background text-foreground antialiased transition-colors duration-300">
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  usePushNavigation();
  const [showTour, setShowTour] = useState(false);

  const tourSteps: TourStep[] = [
    {
      rota: "/",
      nome_rota: "Início",
      descricao: "Acompanhe as rodadas, entre na lista de presença e veja o status do rateio.",
    },
    {
      rota: "/_admin",
      nome_rota: "Administração",
      descricao: "Ferramentas para organizadores: gestão de jogadores, sorteio de times e financeiro.",
    },
    {
      rota: "/admin/login",
      nome_rota: "Acesso ADM",
      descricao: "Área de login para os administradores das turmas.",
    },
    {
      rota: "minha-situacao",
      nome_rota: "Minha Situação",
      descricao: "Veja rapidamente se você está na lista principal ou na reserva.",
    },
    {
      rota: "rateio",
      nome_rota: "Financeiro",
      descricao: "Transparência total sobre a arrecadação para equipamentos e materiais.",
    },
  ];

  return (
    <ThemeProvider defaultTheme="system" storageKey="spp-ui-theme">
      <QueryClientProvider client={queryClient}>
        <Outlet />
        
        {/* Botão flutuante para iniciar o tour */}
      <Button
        variant="outline"
        size="icon"
        className="fixed bottom-4 left-4 z-40 rounded-full h-10 w-10 border-brand-border bg-brand-surface/80 backdrop-blur shadow-lg text-brand-gold hover:text-brand-gold hover:bg-brand-surface"
        onClick={() => setShowTour(true)}
        aria-label="Ajuda interativa"
      >
        <HelpCircle className="h-6 w-6" />
      </Button>

      {showTour && (
        <InteractiveTour 
          steps={tourSteps} 
          onClose={() => setShowTour(false)} 
        />
      )}

      <Toaster richColors position="top-center" />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
