import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { check_admin } from "@/lib/admin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";

export const Route = createFileRoute("/admin/login")({
  head: () => ({
    meta: [
      { title: "Acesso administrativo — SE PASSOU, E PONTO" },
      { name: "description", content: "Acesso dos administradores às turmas do SE PASSOU, E PONTO." },
      { property: "og:title", content: "Acesso administrativo — SE PASSOU, E PONTO" },
      { property: "og:description", content: "Entrada para os organizadores do SE PASSOU, E PONTO." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AdminLogin,
});

function AdminLogin() {
  const navigate = useNavigate();
  const checkAdmin = useServerFn(check_admin);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Se já estiver logado como admin, redireciona
    // Fazemos isso de forma não bloqueante para o render inicial
    const checkExistingSession = async () => {
      const { data } = await supabase.auth.getSession(); // getSession é mais rápido para checagem inicial
      if (data.session) {
        try {
          // Apenas tenta validar se já houver sessão
          const r = await checkAdmin();
          if (r.is_admin) navigate({ to: "/admin", replace: true });
        } catch {}
      }
    };
    checkExistingSession();
  }, [checkAdmin, navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    console.log("[ADMIN LOGIN TRACE] Iniciando tentativa de login para:", email);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      
      console.log("[ADMIN LOGIN TRACE] Resultado Supabase Auth:", {
        email,
        errorCode: error?.code,
        errorMessage: error?.message,
        hasUser: !!data?.user,
        hasSession: !!data?.session,
        userId: data?.user?.id
      });

      if (error) {
        toast.error(error.message || "E-mail ou senha incorretos.");
        return;
      }

      if (!data.user) {
        toast.error("Erro inesperado: Usuário não retornado após autenticação.");
        return;
      }

      // valida role admin no servidor
      console.log("[ADMIN LOGIN TRACE] Validando role admin para usuário:", data.user.id);
      const r = await checkAdmin();
      console.log("[ADMIN LOGIN TRACE] Resultado validação admin:", r);

      if (!r.is_admin) {
        console.warn("[ADMIN LOGIN TRACE] Usuário autenticado mas não possui role admin. Revogando sessão.");
        await supabase.auth.signOut();
        toast.error("Acesso negado. Este usuário não possui permissões administrativas.");
        return;
      }
      
      console.log("[ADMIN LOGIN TRACE] Login bem-sucedido. Redirecionando...");
      navigate({ to: "/admin", replace: true });
    } catch (err: any) {
      console.error("[ADMIN LOGIN TRACE] Erro crítico no fluxo de login:", err);
      if (err.message === 'Failed to fetch') {
        toast.error("Erro de conexão: Não foi possível alcançar o servidor. Verifique sua internet.");
      } else {
        toast.error(err.message || "Não foi possível entrar. Tente novamente.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-dvh bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-sm p-6 space-y-5 bg-brand-surface border-brand-border">
        <div className="flex flex-col items-center text-center space-y-2">
          <img
            src="/se-passou-e-ponto.png"
            alt="Escudo SE PASSOU, É PONTO"
            className="h-16 w-16 rounded-full ring-2 ring-brand-gold/40"
          />
          <h1 className="font-display text-xl font-bold uppercase tracking-wide text-gradient-gold">
            Acesso administrativo
          </h1>
          <p className="text-sm text-brand-silver">
            Apenas administradores autorizados.
          </p>
        </div>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="password">Senha</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Entrando..." : "Entrar"}
          </Button>
        </form>
        <div className="text-center text-xs text-muted-foreground">
          <Link to="/" className="underline">
            Voltar para a lista pública
          </Link>
        </div>
      </Card>
    </div>
  );
}
