import * as React from "react";
import { ArrowLeft } from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface BackButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Rota de fallback se não houver histórico (default: /painel) */
  fallback?: string;
  label?: string;
}

/**
 * Botão Voltar padronizado.
 * - Tenta voltar no histórico
 * - Se não houver histórico (entrada direta), navega para o fallback
 */
export const BackButton: React.FC<BackButtonProps> = ({
  fallback = "/painel",
  label = "Voltar",
  className,
  ...rest
}) => {
  const navigate = useNavigate();
  const location = useLocation();

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    rest.onClick?.(e);
    if (e.defaultPrevented) return;
    // window.history.length > 1 indica histórico real (mas inclui o atual)
    const hasHistory =
      typeof window !== "undefined" &&
      window.history.length > 1 &&
      (location.key !== "default");
    if (hasHistory) navigate(-1);
    else navigate(fallback, { replace: true });
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={handleClick}
      className={cn(
        "h-9 -ml-2 px-2 text-muted-foreground hover:text-foreground gap-1.5",
        className
      )}
      {...rest}
    >
      <ArrowLeft className="w-4 h-4" />
      <span className="font-medium">{label}</span>
    </Button>
  );
};

interface PageHeaderProps {
  title: string;
  subtitle?: React.ReactNode;
  /** Mostrar botão voltar */
  back?: boolean | { fallback?: string; label?: string };
  /** Botões/ações à direita (desktop) — empilham no mobile */
  actions?: React.ReactNode;
  /** Conteúdo extra abaixo do título (filtros, abas, etc.) */
  children?: React.ReactNode;
  className?: string;
  /** Tornar o cabeçalho sticky (útil em telas longas) */
  sticky?: boolean;
}

/**
 * Cabeçalho padronizado de página.
 * - Título + subtítulo
 * - Ações empilháveis (responsivas)
 * - Botão voltar opcional
 */
export const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  back,
  actions,
  children,
  className,
  sticky,
}) => {
  const backProps = typeof back === "object" ? back : {};
  return (
    <div
      className={cn(
        "mb-4 sm:mb-6",
        sticky &&
          "sticky top-14 z-20 -mx-4 lg:-mx-6 px-4 lg:px-6 py-3 bg-background/85 backdrop-blur-sm border-b border-border",
        className
      )}
    >
      {back && (
        <div className="mb-1">
          <BackButton {...backProps} />
        </div>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl sm:text-2xl font-bold font-display text-foreground tracking-tight truncate">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2">
              {subtitle}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2 sm:flex-nowrap sm:justify-end shrink-0">
            {actions}
          </div>
        )}
      </div>
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
};

export default PageHeader;
