import React from "react";
import { PlayerEventStatus as StatusType } from "@/lib/players-signup.types";
import { CheckCircle2, Clock, AlertCircle, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface PlayerEventStatusProps {
  status: StatusType;
  position?: number;
  className?: string;
  variant?: 'compact' | 'full';
  event?: any;
}

export function PlayerEventStatus({ status, position, className, variant = 'full', event }: PlayerEventStatusProps) {
  const config = {
    NOT_REGISTERED: {
      label: "NÃO INSCRITO",
      icon: HelpCircle,
      tone: "neutral",
      description: position ? `${position}º de ${event?.main_limit ?? 18} Titulares` : "Você ainda não entrou na lista para esta rodada.",
      colorClass: "text-brand-silver/50",
      bgClass: "bg-brand-surface",
      borderClass: "border-brand-border"
    },
    MAIN_LIST: {
      label: "VAGA CONFIRMADA",
      icon: CheckCircle2,
      tone: "success",
      description: position ? `${position}º DE ${event?.main_limit ?? 18} TITULARES` : "VOCÊ ESTÁ NA LISTA PRINCIPAL.",
      colorClass: "text-emerald-400",
      bgClass: "bg-emerald-500/10",
      borderClass: "border-emerald-500/20"
    },
    WAITLIST: {
      label: "FILA DE ESPERA",
      icon: Clock,
      tone: "warning",
      description: position ? `${position}º LUGAR NA FILA DE ESPERA` : "VOCÊ ESTÁ NA FILA DE ESPERA.",
      colorClass: "text-amber-400",
      bgClass: "bg-amber-500/10",
      borderClass: "border-amber-500/20"
    },
    PROMOTED_FROM_WAITLIST: {
      label: "VAGA CONFIRMADA",
      icon: CheckCircle2,
      tone: "success",
      description: "VOCÊ CONSEGUIU UMA VAGA! 🎉",
      colorClass: "text-emerald-400",
      bgClass: "bg-emerald-500/10",
      borderClass: "border-emerald-500/20"
    },
    LEFT_EVENT: {
      label: "SAIU DA LISTA",
      icon: AlertCircle,
      tone: "error",
      description: "VOCÊ CANCELOU SUA PARTICIPAÇÃO NESTE EVENTO.",
      colorClass: "text-red-400",
      bgClass: "bg-red-500/10",
      borderClass: "border-red-500/20"
    },
    EVENT_CLOSED: {
      label: "RODADA ENCERRADA",
      icon: AlertCircle,
      tone: "neutral",
      description: "AS INSCRIÇÕES PARA ESTA RODADA FORAM ENCERRADAS.",
      colorClass: "text-brand-silver/40",
      bgClass: "bg-brand-surface",
      borderClass: "border-brand-border"
    }
  }[status] || {
    label: "DESCONHECIDO",
    icon: HelpCircle,
    tone: "neutral",
    description: "STATUS NÃO IDENTIFICADO.",
    colorClass: "text-brand-silver/40",
    bgClass: "bg-brand-surface",
    borderClass: "border-brand-border"
  };

  const Icon = config.icon;

  if (variant === 'compact') {
    return (
      <div className={cn(
        "flex items-center gap-2 px-2.5 py-1.5 rounded-lg border text-[10px] font-black uppercase tracking-widest Oswald",
        config.bgClass,
        config.borderClass,
        config.colorClass,
        className
      )}>
        <Icon className="h-3.5 w-3.5" />
        <span>
          {config.label}
          {status === 'WAITLIST' && position ? ` • #${position}` : ''}
        </span>
      </div>
    );
  }

  return (
    <div className={cn(
      "p-4 rounded-2xl border flex flex-col items-center text-center gap-2 relative overflow-hidden group transition-all",
      config.bgClass,
      config.borderClass,
      className
    )}>
      {/* Background Decorator */}
      <div className={cn("absolute -right-4 -top-4 w-24 h-24 rounded-full opacity-5 group-hover:scale-110 transition-transform", config.bgClass)} />
      
      <div className={cn("p-2.5 rounded-full bg-black/20 border border-white/5 relative z-10", config.colorClass)}>
        <Icon className="h-6 w-6" />
      </div>
      
      <div className="relative z-10">
        <h3 className={cn("text-base font-black Oswald uppercase tracking-[0.1em] leading-none mb-1", config.colorClass)}>
          {config.label}
        </h3>
        
        <p className="text-[10px] font-bold text-brand-silver/80 uppercase Oswald tracking-widest max-w-[220px] leading-tight mx-auto">
          {config.description}
        </p>
      </div>
      
      {status === 'WAITLIST' && (
        <div className="mt-1 relative z-10">
          <div className="h-[1px] w-8 bg-brand-gold/20 mx-auto mb-2" />
          <p className="text-[8px] text-brand-silver/40 Oswald uppercase font-black tracking-widest">
            Aguardando liberação de vaga
          </p>
        </div>
      )}
    </div>
  );
}
