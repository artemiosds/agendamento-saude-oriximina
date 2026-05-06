import { FileX, AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title?: string;
  description?: string;
  action?: { label: string; onClick: () => void; icon?: React.ReactNode };
  className?: string;
}

export const EmptyState = ({
  icon,
  title = 'Nenhum registro encontrado',
  description = 'Comece adicionando um novo registro.',
  action,
  className,
}: EmptyStateProps) => (
  <div className={cn('flex flex-col items-center justify-center py-12 sm:py-16 px-4 text-center animate-fade-in', className)}>
    <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
      {icon || <FileX className="w-8 h-8 text-muted-foreground/50" />}
    </div>
    <h3 className="text-base font-semibold text-foreground/80 mb-1">{title}</h3>
    <p className="text-sm text-muted-foreground max-w-xs mb-4">{description}</p>
    {action && (
      <Button onClick={action.onClick} className="gradient-primary text-primary-foreground">
        {action.icon}
        {action.label}
      </Button>
    )}
  </div>
);

interface LoadingStateProps {
  label?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
}

export const LoadingState = ({ label = 'Carregando...', className, size = 'md' }: LoadingStateProps) => {
  const sizeClass = size === 'sm' ? 'w-5 h-5' : size === 'lg' ? 'w-10 h-10' : 'w-7 h-7';
  return (
    <div className={cn('flex flex-col items-center justify-center py-10 px-4 gap-3 text-muted-foreground', className)}>
      <Loader2 className={cn(sizeClass, 'animate-spin text-primary')} />
      <p className="text-sm">{label}</p>
    </div>
  );
};

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

export const ErrorState = ({
  title = 'Algo deu errado',
  description = 'Não foi possível carregar os dados. Tente novamente.',
  onRetry,
  retryLabel = 'Tentar novamente',
  className,
}: ErrorStateProps) => (
  <div className={cn('flex flex-col items-center justify-center py-12 px-4 text-center animate-fade-in', className)}>
    <div className="w-16 h-16 rounded-2xl bg-destructive/10 flex items-center justify-center mb-4">
      <AlertTriangle className="w-8 h-8 text-destructive" />
    </div>
    <h3 className="text-base font-semibold text-foreground mb-1">{title}</h3>
    <p className="text-sm text-muted-foreground max-w-xs mb-4">{description}</p>
    {onRetry && (
      <Button variant="outline" onClick={onRetry}>
        {retryLabel}
      </Button>
    )}
  </div>
);
