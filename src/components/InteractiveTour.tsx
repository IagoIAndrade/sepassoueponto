
import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { HelpCircle, ChevronLeft, ChevronRight, X, Layout, Users, Shield, DollarSign, LogIn } from 'lucide-react';

const IconMap: Record<string, any> = {
  'layout': Layout,
  'users': Users,
  'shield': Shield,
  'dollar': DollarSign,
  'login': LogIn,
  'help': HelpCircle,
};

export type TourStep = {
  rota: string;
  nome_rota: string;
  icone?: string;
  descricao: string;
  selector?: string;
};

interface InteractiveTourProps {
  steps: TourStep[];
  onClose: () => void;
}

export function InteractiveTour({ steps, onClose }: InteractiveTourProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [elements, setElements] = useState<HTMLElement[]>([]);
  const [isOpen, setIsOpen] = useState(true);

  useEffect(() => {
    const detectElements = () => {
      const clickableSelectors = 'button, a, [role="button"]';
      const foundElements = Array.from(document.querySelectorAll<HTMLElement>(clickableSelectors))
        .filter(el => {
          const style = window.getComputedStyle(el);
          return style.display !== 'none' && 
                 style.visibility !== 'hidden' && 
                 el.offsetWidth > 0 && 
                 el.offsetHeight > 0 &&
                 !el.closest('[aria-hidden="true"]');
        });
      setElements(foundElements);
    };

    const timer = setTimeout(detectElements, 500);
    return () => clearTimeout(timer);
  }, []);

  const currentElement = elements[currentStepIndex];
  
  const stepInfo = useMemo(() => {
    if (!currentElement) return null;
    
    const href = (currentElement as HTMLAnchorElement).href || '';
    const text = currentElement.innerText.toLowerCase();
    
    const match = steps.find(s => 
      (href && href.includes(s.rota)) || 
      text.includes(s.nome_rota.toLowerCase())
    );

    return match || {
      rota: 'N/A',
      nome_rota: currentElement.innerText || 'Elemento Interativo',
      descricao: 'Este elemento permite realizar uma ação ou navegar no aplicativo.',
    };
  }, [currentElement, steps]);

  if (!isOpen || elements.length === 0) return null;

  const nextStep = () => {
    if (currentStepIndex < elements.length - 1) {
      const nextIdx = currentStepIndex + 1;
      setCurrentStepIndex(nextIdx);
      elements[nextIdx].scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      handleClose();
    }
  };

  const prevStep = () => {
    if (currentStepIndex > 0) {
      const prevIdx = currentStepIndex - 1;
      setCurrentStepIndex(prevIdx);
      elements[prevIdx].scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const handleClose = () => {
    setIsOpen(false);
    onClose();
  };

  // Coordenadas para o destaque
  const rect = currentElement?.getBoundingClientRect();

  return (
    <div className="fixed inset-0 z-[100] pointer-events-none">
      {/* Backdrop com furo (SVG Mask) */}
      <svg className="absolute inset-0 w-full h-full pointer-events-auto">
        <defs>
          <mask id="tour-mask">
            <rect width="100%" height="100%" fill="white" />
            {rect && (
              <rect 
                x={rect.left - 4} 
                y={rect.top - 4} 
                width={rect.width + 8} 
                height={rect.height + 8} 
                rx="8" 
                fill="black" 
              />
            )}
          </mask>
        </defs>
        <rect 
          width="100%" 
          height="100%" 
          fill="rgba(0,0,0,0.7)" 
          mask="url(#tour-mask)" 
          onClick={handleClose}
        />
      </svg>

      {/* Destaque visual */}
      {rect && (
        <div 
          className="absolute border-2 border-brand-gold rounded-lg transition-all duration-300 pointer-events-none shadow-[0_0_15px_rgba(234,179,8,0.5)]"
          style={{
            top: rect.top - 4 + window.scrollY,
            left: rect.left - 4 + window.scrollX,
            width: rect.width + 8,
            height: rect.height + 8,
          }}
        />
      )}

      {/* Popover/Tooltip do Tour */}
      {rect && (
        <div 
          className="absolute z-[101] w-72 bg-brand-surface border border-brand-border rounded-xl shadow-2xl p-4 pointer-events-auto animate-in fade-in zoom-in-95 duration-300"
          style={{
            top: rect.bottom + 12 + window.scrollY > window.innerHeight + window.scrollY - 200 
              ? rect.top - 200 + window.scrollY 
              : rect.bottom + 12 + window.scrollY,
            left: Math.min(Math.max(20, rect.left + rect.width / 2 - 144), window.innerWidth - 300) + window.scrollX,
          }}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {(() => {
                const Icon = (stepInfo && stepInfo.icone) ? IconMap[stepInfo.icone] || HelpCircle : HelpCircle;
                return <Icon className="w-4 h-4 text-brand-gold" />;
              })()}
              <span className="text-[10px] font-bold uppercase tracking-wider text-brand-silver">Guia</span>
            </div>
            <Button variant="ghost" size="icon" className="h-6 w-6 text-brand-silver hover:text-white" onClick={handleClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>

          {stepInfo && (
            <div className="space-y-1.5 mb-4">
              <h4 className="font-display text-sm font-bold text-brand-white">
                {stepInfo.nome_rota}
              </h4>
              <p className="text-[11px] text-brand-silver leading-relaxed">
                {stepInfo.descricao}
              </p>
            </div>
          )}

          <div className="flex items-center justify-between pt-3 border-t border-brand-border/40">
            <span className="text-[10px] text-brand-silver font-medium">
              {currentStepIndex + 1} / {elements.length}
            </span>
            <div className="flex gap-1.5">
              <Button 
                variant="outline" 
                size="sm" 
                className="h-7 text-[10px] px-2 border-brand-border"
                onClick={prevStep}
                disabled={currentStepIndex === 0}
              >
                <ChevronLeft className="w-3 h-3" />
              </Button>
              <Button 
                size="sm" 
                className="h-7 text-[10px] px-3 bg-brand-gold text-brand-blue hover:bg-brand-gold/90 font-bold"
                onClick={nextStep}
              >
                {currentStepIndex === elements.length - 1 ? 'OK' : 'Próximo'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
