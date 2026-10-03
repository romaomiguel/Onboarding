import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...i: ClassValue[]) => twMerge(clsx(i));

export const onlyDigits = (s: string) => s.replace(/\D/g, '');

export const maskCnpj = (v: string) => {
  const d = onlyDigits(v).slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
};

export const maskCep = (v: string) => onlyDigits(v).slice(0, 8).replace(/^(\d{5})(\d)/, '$1-$2');

// CPF (até 11 dígitos) ou CNPJ (12 a 14), conforme o que for digitado. Valores mascarados pela Receita (com *) ficam como estão.
export const maskDocumento = (v: string) => {
  if (v.includes('*')) return v;
  const d = onlyDigits(v).slice(0, 14);
  if (d.length > 11) return maskCnpj(d);
  return d.replace(/^(\d{3})(\d)/, '$1.$2').replace(/^(\d{3}\.\d{3})(\d)/, '$1.$2').replace(/^(\d{3}\.\d{3}\.\d{3})(\d)/, '$1-$2');
};

// CNAE no padrão da Receita: 00.00-0-00 (aceita com ou sem pontuação).
export const maskCnae = (v: string) =>
  onlyDigits(v).slice(0, 7).replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2}\.\d{2})(\d)/, '$1-$2').replace(/^(\d{2}\.\d{2}-\d)(\d)/, '$1-$2');

export const dataBR = (d?: string | null) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '—');

export const brl = (n?: number | null) =>
  n == null ? '—' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const hojeISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
