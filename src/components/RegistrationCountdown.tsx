import { useState, useEffect } from "react";
import { Clock } from "lucide-react";
import { getRoundRegistrationState } from "@/lib/round-state";

interface RegistrationCountdownProps {
  event: any;
  settings: any;
  onRefresh?: () => void;
}

export function RegistrationCountdown({ event, settings, onRefresh }: RegistrationCountdownProps) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const state = getRoundRegistrationState(
    { event_date: event.event_date, status: event.status },
    { 
      open_weekday: settings.open_weekday, 
      open_time: settings.open_time, 
      priority_minutes: settings.priority_minutes 
    }
  );

  // Se o status mudou para open mas a página ainda vê scheduled, solicita refresh
  useEffect(() => {
    if (event.status === "scheduled" && (state.phase === "priority" || state.phase === "general")) {
      onRefresh?.();
    }
  }, [state.phase, event.status, onRefresh]);

  if (!state.countdown || state.phase === "general" || state.phase === "closed") return null;

  return (
    <div className="flex items-center gap-2 bg-brand-gold/10 border border-brand-gold/20 rounded-lg px-3 py-2 animate-in fade-in zoom-in duration-300">
      <Clock className="w-3.5 h-3.5 text-brand-gold animate-pulse" />
      <div className="flex flex-col">
        <span className="text-[11px] font-black Oswald uppercase text-brand-gold/70 leading-none mb-0.5">
          {state.phase === "scheduled" ? "ABERTURA EM" : "PRIORIDADE ENCERRA EM"}
        </span>
        <span className="text-sm font-black Oswald tabular-nums text-brand-gold leading-none">
          {state.countdown}
        </span>
      </div>
    </div>
  );
}
