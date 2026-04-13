import { FileX } from 'lucide-react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title?: string;
  description?: string;
}

export const EmptyState = ({
  icon,
  title = 'Nenhum registro encontrado',
  description = 'Comece adicionando um novo registro.',
}: EmptyStateProps) => (
  <div className="flex flex-col items-center justify-center py-16 px-4 text-center animate-fade-in">
    <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
      {icon || <FileX className="w-8 h-8 text-muted-foreground/50" />}
    </div>
    <h3 className="text-base font-semibold text-foreground/80 mb-1">{title}</h3>
    <p className="text-sm text-muted-foreground max-w-xs">{description}</p>
  </div>
);
