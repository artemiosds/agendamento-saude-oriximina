import { z } from 'zod';

export const telefoneRegex = /^\(?\d{2}\)?\s?\d{4,5}-?\d{4}$/;
export const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const pacienteSchema = z.object({
  nome: z.string().trim().min(1, 'Nome é obrigatório').max(200),
  cpf: z.string().optional().default(''),
  telefone: z.string().trim().min(1, 'Telefone é obrigatório').regex(telefoneRegex, 'Informe um telefone válido. Ex: (93) 99999-0000'),
  email: z.string().trim().optional().default('').refine(val => !val || emailRegex.test(val), 'Informe um e-mail válido'),
  dataNascimento: z.string().optional().default(''),
});

export function validatePacienteFields(fields: { nome: string; telefone?: string; email?: string }): string | null {
  if (!fields.nome.trim()) return 'Nome é obrigatório';
  // Telefone is optional — only validate format if provided
  // Telefone e Email são opcionais, mas se preenchidos, validamos o formato básico
  if (fields.telefone?.trim() && fields.telefone.length > 5 && !telefoneRegex.test(fields.telefone.trim())) return 'Informe um telefone válido.';
  // Email is optional — only validate format if provided
  if (fields.email?.trim() && !emailRegex.test(fields.email.trim())) return 'Informe um e-mail válido';
  return null;
}
