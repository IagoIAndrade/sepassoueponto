import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, useEffect, lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { 
  Users, 
  Calendar, 
  Settings, 
  ShieldCheck, 
  Briefcase,
  Layers,
  Shield,
  LayoutGrid,
  History,
  ListOrdered,
  AlertCircle,
  Users2,
  DollarSign,
  GanttChartSquare,
  ClipboardList
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { 
  admin_list_groups, 
  check_admin,
} from "@/lib/admin.functions";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { confirmDiscardUnsaved } from "@/lib/unsaved-guard";


import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { AdminGroupProvider, AdminGroupSelector, useAdminGroup } from "@/lib/admin-group-context";
import { ThemeToggle } from "@/components/ThemeToggle";


const ApprovalsTab = lazy(() => import("@/components/ApprovalsTab").then(m => ({ default: m.ApprovalsTab })));
const AcessosARevisarTab = lazy(() => import("@/components/AcessosARevisarTab").then(m => ({ default: m.AcessosARevisarTab })));
const SkillsTab = lazy(() => import("@/components/admin-skills-tab").then(m => ({ default: m.SkillsTab })));
const PlayersTab = lazy(() => import("@/components/admin-players-tab").then(m => ({ default: m.PlayersTab })));
const OrganizersTab = lazy(() => import("@/components/admin-organizers-tab").then(m => ({ default: m.OrganizersTab })));
const AdminFrequencyTab = lazy(() => import("@/components/AdminFrequencyTab").then(m => ({ default: m.AdminFrequencyTab })));
const AdminPriorityTab = lazy(() => import("@/components/admin-priority-tab").then(m => ({ default: m.AdminPriorityTab })));

const ListTab = lazy(() => import("./tabs/ListTab").then(m => ({ default: m.ListTab })));
const TeamsTab = lazy(() => import("./tabs/TeamsTab").then(m => ({ default: m.TeamsTab })));
const IncidentsTab = lazy(() => import("./tabs/IncidentsTab").then(m => ({ default: m.IncidentsTab })));
const FundParticipantsTab = lazy(() => import("./tabs/FundParticipantsTab").then(m => ({ default: m.FundParticipantsTab })));
const SettingsTab = lazy(() => import("./tabs/SettingsTab").then(m => ({ default: m.SettingsTab })));
const WithdrawalsTab = lazy(() => import("./tabs/WithdrawalsTab").then(m => ({ default: m.WithdrawalsTab })));



export const Route = createFileRoute('/_admin/admin')({
  head: () => ({
    meta: [
      { title: "Painel administrativo — SE PASSOU, E PONTO" },
      { name: "description", content: "Gestão das turmas, listas e times do SE PASSOU, E PONTO." },
      { property: "og:title", content: "Painel administrativo — SE PASSOU, E PONTO" },
      { property: "og:description", content: "Central administrativa das turmas do SE PASSOU, E PONTO." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: AdminPage,
});

function AdminPage() {
  return (
    <AdminGroupProvider>
      <AdminPanel />
    </AdminGroupProvider>
  );
}

function AdminPanel() {
  const { groupId } = useAdminGroup();
  const [activeMainTab, setActiveMainTab] = useState("turma");
  
  // Persist tab selection
  useEffect(() => {
    const saved = localStorage.getItem("admin-active-main-tab");
    if (saved) setActiveMainTab(saved);
  }, []);

  const handleTabChange = (val: string) => {
    setActiveMainTab(val);
    localStorage.setItem("admin-active-main-tab", val);
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-brand-background text-slate-900 dark:text-brand-white pb-safe transition-colors">
      <div className="max-w-[1280px] mx-auto px-4 py-6 space-y-8">
        
        {/* HEADER SECTION */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-200 dark:border-brand-border/50 pb-6">
          <div className="space-y-1">
            <h1 className="text-2xl font-black font-display text-slate-900 dark:text-brand-white uppercase tracking-tighter flex items-center gap-2">
              <ShieldCheck className="w-8 h-8 text-pink-600 dark:text-brand-gold" />
              SE PASSOU, É PONTO
            </h1>
            <p className="text-xs text-slate-500 dark:text-brand-silver uppercase font-bold tracking-widest">Painel Administrativo</p>
          </div>
          
          <div className="flex flex-col md:items-end gap-2">
            <div className="flex items-center gap-4 bg-brand-gold/10 p-2.5 rounded-xl border-2 border-brand-gold/40 shadow-[0_0_15px_rgba(255,215,0,0.1)]">
               <ThemeToggle />
               <div className="w-px h-6 bg-brand-gold/20 mx-1 hidden md:block" />
               <div className="flex items-center gap-2" onClickCapture={(e) => {
                 if (typeof confirmDiscardUnsaved === 'function' && !confirmDiscardUnsaved()) {
                   e.stopPropagation();
                   e.preventDefault();
                 }
               }}>
                 <LayoutGrid className="w-5 h-5 text-brand-gold" />
                 <AdminGroupSelector />
               </div>
               <div className="w-px h-6 bg-brand-gold/20 mx-1" />
               <Button 
                 variant="ghost" 
                 size="sm" 
                  onClick={async () => {
                    await supabase.auth.signOut();
                    window.location.href = "/admin/login";
                  }} 
                  aria-label="Sair do painel administrativo"
                  className="h-9 px-3 text-[10px] font-bold uppercase tracking-widest text-brand-silver hover:text-white hover:bg-white/5"
               >
                 <LogOut className="w-4 h-4 mr-2" /> Sair
               </Button>
            </div>
            <p className="text-[10px] text-brand-gold/80 font-bold uppercase tracking-widest text-right max-w-[280px]">
              A aba Acessos exibe dados globais. O seletor superior afeta apenas a aba Turma.
            </p>
          </div>
        </div>

        {/* MAIN NAVIGATION */}
        <Tabs value={activeMainTab} onValueChange={handleTabChange} className="w-full space-y-6">
          <TabsList className="grid grid-cols-5 bg-white/80 dark:bg-brand-surface/40 border border-slate-200 dark:border-brand-border p-1 h-14 md:h-16 rounded-xl sticky top-2 z-30 backdrop-blur-md shadow-sm dark:shadow-lg dark:shadow-black/20 overflow-x-auto">
            <TabsTrigger 
              value="acessos" 
              className="flex flex-col gap-0.5 data-[state=active]:bg-pink-50 dark:data-[state=active]:bg-brand-surface/60 data-[state=active]:text-pink-600 dark:data-[state=active]:text-brand-gold data-[state=active]:shadow-sm rounded-lg transition-all relative group overflow-hidden"
            >
              <div className="absolute inset-x-0 bottom-0 h-0.5 bg-pink-500 dark:bg-brand-gold scale-x-0 data-[state=active]:scale-x-100 transition-transform origin-left group-data-[state=active]:scale-x-100" />
              <span className="text-[8px] md:text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-brand-silver/40 group-data-[state=active]:text-pink-500/50 dark:group-data-[state=active]:text-brand-gold/50">01</span>
              <span className="text-[10px] md:text-[11px] font-black uppercase tracking-widest flex items-center gap-1.5">
                <Shield className="w-3 h-3 md:w-3.5 md:h-3.5 opacity-50 group-data-[state=active]:opacity-100" />
                Acessos
              </span>
            </TabsTrigger>
            <TabsTrigger 
              value="geral" 
              className="flex flex-col gap-0.5 data-[state=active]:bg-pink-50 dark:data-[state=active]:bg-brand-surface/60 data-[state=active]:text-pink-600 dark:data-[state=active]:text-brand-gold data-[state=active]:shadow-sm rounded-lg transition-all relative group overflow-hidden"
            >
              <div className="absolute inset-x-0 bottom-0 h-0.5 bg-pink-500 dark:bg-brand-gold scale-x-0 data-[state=active]:scale-x-100 transition-transform origin-left group-data-[state=active]:scale-x-100" />
              <span className="text-[8px] md:text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-brand-silver/40 group-data-[state=active]:text-pink-500/50 dark:group-data-[state=active]:text-brand-gold/50">02</span>
              <span className="text-[10px] md:text-[11px] font-black uppercase tracking-widest flex items-center gap-1.5">
                <Users className="w-3 h-3 md:w-3.5 md:h-3.5 opacity-50 group-data-[state=active]:opacity-100" />
                Jogadores
              </span>
            </TabsTrigger>
            <TabsTrigger 
              value="turma" 
              className="flex flex-col gap-0.5 data-[state=active]:bg-pink-50 dark:data-[state=active]:bg-brand-surface/60 data-[state=active]:text-pink-600 dark:data-[state=active]:text-brand-gold data-[state=active]:shadow-sm rounded-lg transition-all relative group overflow-hidden"
            >
              <div className="absolute inset-x-0 bottom-0 h-0.5 bg-pink-500 dark:bg-brand-gold scale-x-0 data-[state=active]:scale-x-100 transition-transform origin-left group-data-[state=active]:scale-x-100" />
              <span className="text-[8px] md:text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-brand-silver/40 group-data-[state=active]:text-pink-500/50 dark:group-data-[state=active]:text-brand-gold/50">03</span>
              <span className="text-[10px] md:text-[11px] font-black uppercase tracking-widest flex items-center gap-1.5">
                <LayoutGrid className="w-3 h-3 md:w-3.5 md:h-3.5 opacity-50 group-data-[state=active]:opacity-100" />
                Turma
              </span>
            </TabsTrigger>
            <TabsTrigger 
              value="prioridade" 
              className="flex flex-col gap-0.5 data-[state=active]:bg-pink-50 dark:data-[state=active]:bg-brand-surface/60 data-[state=active]:text-pink-600 dark:data-[state=active]:text-brand-gold data-[state=active]:shadow-sm rounded-lg transition-all relative group overflow-hidden"
            >
              <div className="absolute inset-x-0 bottom-0 h-0.5 bg-pink-500 dark:bg-brand-gold scale-x-0 data-[state=active]:scale-x-100 transition-transform origin-left group-data-[state=active]:scale-x-100" />
              <span className="text-[8px] md:text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-brand-silver/40 group-data-[state=active]:text-pink-500/50 dark:group-data-[state=active]:text-brand-gold/50">04</span>
              <span className="text-[10px] md:text-[11px] font-black uppercase tracking-widest flex items-center gap-1.5">
                <Briefcase className="w-3 h-3 md:w-3.5 md:h-3.5 opacity-50 group-data-[state=active]:opacity-100" />
                Prioridade
              </span>
            </TabsTrigger>
            <TabsTrigger 
              value="frequencia" 
              className="flex flex-col gap-0.5 data-[state=active]:bg-pink-50 dark:data-[state=active]:bg-brand-surface/60 data-[state=active]:text-pink-600 dark:data-[state=active]:text-brand-gold data-[state=active]:shadow-sm rounded-lg transition-all relative group overflow-hidden"
            >
              <div className="absolute inset-x-0 bottom-0 h-0.5 bg-pink-500 dark:bg-brand-gold scale-x-0 data-[state=active]:scale-x-100 transition-transform origin-left group-data-[state=active]:scale-x-100" />
              <span className="text-[8px] md:text-[9px] font-black uppercase tracking-widest text-slate-400 dark:text-brand-silver/40 group-data-[state=active]:text-pink-500/50 dark:group-data-[state=active]:text-brand-gold/50">05</span>
              <span className="text-[10px] md:text-[11px] font-black uppercase tracking-widest flex items-center gap-1.5">
                <History className="w-3 h-3 md:w-3.5 md:h-3.5 opacity-50 group-data-[state=active]:opacity-100" />
                Frequência
              </span>
            </TabsTrigger>
          </TabsList>

          {/* SECTION: GESTÃO DE ACESSOS */}
          <TabsContent value="acessos" className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <Tabs defaultValue="approvals" className="w-full">
              <TabsList className="flex bg-slate-50/95 dark:bg-[#020B1B]/95 sticky top-[72px] md:top-0 z-10 border-b border-slate-200 dark:border-brand-border h-10 p-0 gap-6 w-full justify-start rounded-none overflow-x-auto no-scrollbar backdrop-blur-sm">

                <TabsTrigger value="approvals" className="bg-transparent border-b-2 border-transparent data-[state=active]:border-pink-600 dark:data-[state=active]:border-brand-gold rounded-none px-1 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-brand-silver data-[state=active]:text-pink-600 dark:data-[state=active]:text-brand-gold">
                  Solicitações
                </TabsTrigger>
                <TabsTrigger value="review" className="bg-transparent border-b-2 border-transparent data-[state=active]:border-pink-600 dark:data-[state=active]:border-brand-gold rounded-none px-1 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-brand-silver data-[state=active]:text-pink-600 dark:data-[state=active]:text-brand-gold">
                  Revisar Vínculos
                </TabsTrigger>
              </TabsList>
              <div className="mt-6">
                <TabsContent value="approvals">
                  <Suspense fallback={<div className="p-8 text-center text-brand-silver/50 Oswald uppercase text-xs">Carregando solicitações...</div>}>
                    <ApprovalsTab />
                  </Suspense>
                </TabsContent>
                <TabsContent value="review">
                  <Suspense fallback={<div className="p-8 text-center text-brand-silver/50 Oswald uppercase text-xs">Carregando vínculos...</div>}>
                    <AcessosARevisarTab />
                  </Suspense>
                </TabsContent>

              </div>
            </Tabs>
          </TabsContent>

          {/* SECTION: GESTÃO GERAL */}
          <TabsContent value="geral" className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <Tabs defaultValue="players" className="w-full">
              <TabsList className="flex bg-slate-50/95 dark:bg-[#020B1B]/95 sticky top-[72px] md:top-0 z-10 border-b border-slate-200 dark:border-brand-border h-10 p-0 gap-6 w-full justify-start rounded-none overflow-x-auto no-scrollbar backdrop-blur-sm">
                <TabsTrigger value="players" className="bg-transparent border-b-2 border-transparent data-[state=active]:border-pink-600 dark:data-[state=active]:border-brand-gold rounded-none px-1 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-brand-silver data-[state=active]:text-pink-600 dark:data-[state=active]:text-brand-gold">
                  Base de Jogadores
                </TabsTrigger>
                <TabsTrigger value="skills" className="bg-transparent border-b-2 border-transparent data-[state=active]:border-pink-600 dark:data-[state=active]:border-brand-gold rounded-none px-1 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-brand-silver data-[state=active]:text-pink-600 dark:data-[state=active]:text-brand-gold">
                  Habilidades Globais
                </TabsTrigger>
              </TabsList>
              <div className="mt-6">
                <TabsContent value="players">
                  <Suspense fallback={<div className="p-8 text-center text-brand-silver/50 Oswald uppercase text-xs">Carregando base de jogadores...</div>}>
                    <PlayersTab />
                  </Suspense>
                </TabsContent>
                <TabsContent value="skills">
                  <Suspense fallback={<div className="p-8 text-center text-brand-silver/50 Oswald uppercase text-xs">Carregando habilidades...</div>}>
                    <SkillsTab />
                  </Suspense>
                </TabsContent>

              </div>
            </Tabs>
          </TabsContent>

          {/* SECTION: FREQUÊNCIA */}
          <TabsContent value="frequencia" className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <Suspense fallback={<div className="p-8 text-center text-brand-silver/50 Oswald uppercase text-xs">Carregando frequência...</div>}>
              <AdminFrequencyTab />
            </Suspense>
          </TabsContent>

          {/* SECTION: PRIORIDADE */}
          <TabsContent value="prioridade" className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            <Suspense fallback={<div className="p-8 text-center text-brand-silver/50 Oswald uppercase text-xs">Carregando prioridades...</div>}>
              <AdminPriorityTab />
            </Suspense>
          </TabsContent>

          {/* SECTION: GESTÃO DA TURMA */}
          <TabsContent value="turma" className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {!groupId ? (
              <Card className="p-12 text-center bg-brand-surface/20 border-brand-border space-y-4">
                <div className="p-4 bg-brand-gold/10 w-fit mx-auto rounded-full">
                  <LayoutGrid className="w-12 h-12 text-brand-gold" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-xl font-black uppercase text-brand-white Oswald">Selecione uma turma</h2>
                  <p className="text-brand-silver text-xs max-w-xs mx-auto">Para gerenciar listas, times e regras, selecione uma turma no seletor superior.</p>
                </div>
              </Card>
            ) : (
              <Tabs defaultValue="list" className="w-full">
                <TabsList className="flex bg-slate-50/95 dark:bg-[#020B1B]/95 sticky top-[72px] md:top-[80px] z-20 border-b border-slate-200 dark:border-brand-border h-11 p-0 gap-1 md:gap-2 w-full justify-start rounded-none overflow-x-auto no-scrollbar backdrop-blur-md shadow-sm">
                  <TabsTrigger value="list" className="bg-transparent border-b-2 border-transparent data-[state=active]:bg-pink-50 dark:data-[state=active]:bg-transparent data-[state=active]:border-pink-600 dark:data-[state=active]:border-brand-gold rounded-none px-3 text-[10px] md:text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-brand-silver data-[state=active]:text-pink-600 dark:data-[state=active]:text-brand-gold flex items-center gap-1.5 transition-all">
                    <ListOrdered className="w-3.5 h-3.5" />
                    Lista
                  </TabsTrigger>
                  <TabsTrigger value="organizers" className="bg-transparent border-b-2 border-transparent data-[state=active]:bg-pink-50 dark:data-[state=active]:bg-transparent data-[state=active]:border-pink-600 dark:data-[state=active]:border-brand-gold rounded-none px-3 text-[10px] md:text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-brand-silver data-[state=active]:text-pink-600 dark:data-[state=active]:text-brand-gold flex items-center gap-1.5 transition-all">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Organização
                  </TabsTrigger>
                  <TabsTrigger value="incidents" className="bg-transparent border-b-2 border-transparent data-[state=active]:bg-pink-50 dark:data-[state=active]:bg-transparent data-[state=active]:border-pink-600 dark:data-[state=active]:border-brand-gold rounded-none px-3 text-[10px] md:text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-brand-silver data-[state=active]:text-pink-600 dark:data-[state=active]:text-brand-gold flex items-center gap-1.5 transition-all">
                    <AlertCircle className="w-3.5 h-3.5" />
                    Ocorrências
                  </TabsTrigger>
                  <TabsTrigger value="teams" className="bg-transparent border-b-2 border-transparent data-[state=active]:bg-pink-50 dark:data-[state=active]:bg-transparent data-[state=active]:border-pink-600 dark:data-[state=active]:border-brand-gold rounded-none px-3 text-[10px] md:text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-brand-silver data-[state=active]:text-pink-600 dark:data-[state=active]:text-brand-gold flex items-center gap-1.5 transition-all">
                    <Users2 className="w-3.5 h-3.5" />
                    Times
                  </TabsTrigger>
                  <TabsTrigger value="settings" className="bg-transparent border-b-2 border-transparent data-[state=active]:bg-pink-50 dark:data-[state=active]:bg-transparent data-[state=active]:border-pink-600 dark:data-[state=active]:border-brand-gold rounded-none px-3 text-[10px] md:text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-brand-silver data-[state=active]:text-pink-600 dark:data-[state=active]:text-brand-gold flex items-center gap-1.5 transition-all">
                    <GanttChartSquare className="w-3.5 h-3.5" />
                    Regras
                  </TabsTrigger>
                  <TabsTrigger value="withdrawals" className="bg-transparent border-b-2 border-transparent data-[state=active]:bg-pink-50 dark:data-[state=active]:bg-transparent data-[state=active]:border-pink-600 dark:data-[state=active]:border-brand-gold rounded-none px-3 text-[10px] md:text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-brand-silver data-[state=active]:text-pink-600 dark:data-[state=active]:text-brand-gold flex items-center gap-1.5 transition-all">
                    <ClipboardList className="w-3.5 h-3.5" />
                    Retiradas
                  </TabsTrigger>
                </TabsList>
                
                <div className="mt-6">
                  <TabsContent value="list">
                    <Suspense fallback={<div className="p-8 text-center text-brand-silver/50 Oswald uppercase text-xs">Carregando lista...</div>}>
                      <ListTab />
                    </Suspense>
                  </TabsContent>
                  <TabsContent value="organizers">
                    <Suspense fallback={<div className="p-8 text-center text-brand-silver/50 Oswald uppercase text-xs">Carregando organizadores...</div>}>
                      <OrganizersTab />
                    </Suspense>
                  </TabsContent>
                  <TabsContent value="incidents">
                    <Suspense fallback={<div className="p-8 text-center text-brand-silver/50 Oswald uppercase text-xs">Carregando ocorrências...</div>}>
                      <IncidentsTab />
                    </Suspense>
                  </TabsContent>
                  <TabsContent value="teams">
                    <Suspense fallback={<div className="p-8 text-center text-brand-silver/50 Oswald uppercase text-xs">Carregando times...</div>}>
                      <TeamsTab />
                    </Suspense>
                  </TabsContent>
                  <TabsContent value="settings">
                    <Suspense fallback={<div className="p-8 text-center text-brand-silver/50 Oswald uppercase text-xs">Carregando configurações...</div>}>
                      <SettingsTab />
                    </Suspense>
                  </TabsContent>
                  <TabsContent value="withdrawals">
                    <Suspense fallback={<div className="p-8 text-center text-brand-silver/50 Oswald uppercase text-xs">Carregando retiradas...</div>}>
                      <WithdrawalsTab />
                    </Suspense>
                  </TabsContent>

                </div>
              </Tabs>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
