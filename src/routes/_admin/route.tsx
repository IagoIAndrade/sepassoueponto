import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { check_admin } from "@/lib/admin.functions";

export const Route = createFileRoute("/_admin")({
  ssr: false,
  beforeLoad: async () => {
    // 1. Verificar sessão ativa no cliente Supabase
    // getSession() é mais rápido e confiável para o gate inicial que getUser() em alguns casos,
    // mas getUser() é mais seguro pois valida o JWT no servidor do Supabase.
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    
    // Se não houver usuário autenticado, redireciona para o login administrativo
    if (!user) {
      throw redirect({ to: "/admin/login" });
    }

    // 2. Validar a função administrativa no servidor (via Server Function protegida)
    // A Server Function check_admin possui o middleware requireSupabaseAuth que valida o token.
    let isAdmin = false;
    try {
      const r = await check_admin();
      isAdmin = !!r.is_admin;
    } catch (err) {
      // Falha segura: qualquer erro (token inválido, expirado ou erro de rede) resulta em negação
      console.error("[Admin Gate] Erro ao validar admin:", err);
      isAdmin = false;
    }

    if (!isAdmin) {
      // Se autenticado (talvez como jogador) mas não for admin real, 
      // redireciona para o login administrativo.
      // Importante: usamos /admin/login para manter o fluxo administrativo separado.
      throw redirect({ to: "/admin/login", replace: true });
    }
  },
  component: () => <Outlet />,
});



