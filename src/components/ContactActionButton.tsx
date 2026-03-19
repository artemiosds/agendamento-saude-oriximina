import React from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { MessageCircle, Phone } from 'lucide-react';

function cleanPhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('55')) return digits;
  if (digits.length >= 10) return `55${digits}`;
  return digits;
}

function isValidPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '');
  return digits.length >= 10;
}

interface ContactActionButtonProps {
  phone?: string;
  patientName?: string;
  unitName?: string;
  size?: 'sm' | 'icon' | 'default';
  variant?: 'ghost' | 'outline' | 'default';
  showLabel?: boolean;
  className?: string;
}

const ContactActionButton: React.FC<ContactActionButtonProps> = ({
  phone,
  patientName,
  unitName,
  size = 'sm',
  variant = 'ghost',
  showLabel = false,
  className = '',
}) => {
  const valid = phone ? isValidPhone(phone) : false;

  const handleClick = () => {
    if (!phone || !valid) return;
    const cleanNum = cleanPhoneNumber(phone);
    const nome = patientName || 'paciente';
    const unidade = unitName || 'nossa unidade';
    const msg = `Bom dia, ${nome}! Aqui é da unidade ${unidade}. Estamos entrando em contato sobre seu atendimento.`;
    const waUrl = `https://wa.me/${cleanNum}?text=${encodeURIComponent(msg)}`;
    
    const win = window.open(waUrl, '_blank');
    // Fallback to tel: if popup blocked
    if (!win || win.closed) {
      window.location.href = `tel:+${cleanNum}`;
    }
  };

  const handlePhoneCall = () => {
    if (!phone) return;
    const cleanNum = cleanPhoneNumber(phone);
    window.location.href = `tel:+${cleanNum}`;
  };

  if (!phone) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button size={size === 'icon' ? 'icon' : 'sm'} variant={variant} disabled className={`h-8 w-8 p-0 ${className}`}>
            <MessageCircle className="w-3.5 h-3.5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Sem telefone cadastrado</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div className={`flex gap-0.5 ${className}`}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size={size === 'icon' ? 'icon' : 'sm'}
            variant={variant}
            className={`${showLabel ? '' : 'h-8 w-8 p-0'} text-green-600 hover:text-green-700 hover:bg-green-50`}
            onClick={handleClick}
            disabled={!valid}
          >
            <MessageCircle className="w-3.5 h-3.5" />
            {showLabel && <span className="ml-1 text-xs">WhatsApp</span>}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{valid ? 'Enviar WhatsApp' : 'Telefone inválido para WhatsApp'}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size={size === 'icon' ? 'icon' : 'sm'}
            variant={variant}
            className={`${showLabel ? '' : 'h-8 w-8 p-0'} text-blue-600 hover:text-blue-700 hover:bg-blue-50`}
            onClick={handlePhoneCall}
          >
            <Phone className="w-3.5 h-3.5" />
            {showLabel && <span className="ml-1 text-xs">Ligar</span>}
          </Button>
        </TooltipTrigger>
        <TooltipContent>Ligar para {phone}</TooltipContent>
      </Tooltip>
    </div>
  );
};

export default ContactActionButton;
