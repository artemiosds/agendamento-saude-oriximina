import React, { useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Printer } from 'lucide-react';

interface Props {
  title: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export const ChartCard: React.FC<Props> = ({ title, children, actions, className = '' }) => {
  const ref = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    if (!ref.current) return;
    const w = window.open('', '_blank');
    if (!w) return;
    const clone = ref.current.cloneNode(true) as HTMLElement;
    w.document.write(`<!DOCTYPE html><html><head><title>${title}</title>
<style>
  body { font-family: 'Inter', sans-serif; padding: 40px; background: #fff; }
  h2 { font-size: 18px; font-weight: 600; margin-bottom: 24px; color: #1e293b; }
  svg { max-width: 100%; height: auto; }
  @media print { body { padding: 20px; } }
</style></head><body><h2>${title}</h2>${clone.innerHTML}</body></html>`);
    w.document.close();
    setTimeout(() => { w.focus(); w.print(); }, 300);
  };

  return (
    <Card className={`group relative rounded-2xl border-0 shadow-[0_4px_12px_rgba(0,0,0,0.05)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.08)] transition-shadow ${className}`}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold font-display text-foreground text-[16px]">{title}</h3>
          <div className="flex items-center gap-2">
            {actions}
            <button
              onClick={handlePrint}
              className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-muted"
              title="Imprimir gráfico"
            >
              <Printer className="w-5 h-5" style={{ color: '#9ca3af' }} />
            </button>
          </div>
        </div>
        <div ref={ref}>{children}</div>
      </CardContent>
    </Card>
  );
};
