import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Normaliza um número de telefone para conter apenas dígitos e remove o DDI 55
 * se ele estiver presente em números brasileiros (12 ou 13 dígitos).
 */
export function normalizePhone(phone: string): string {
  if (!phone) return "";
  let digits = phone.replace(/\D/g, "");
  // Padronização: se começar com 55 e tiver 12 ou 13 dígitos, remove o 55
  if (digits.length >= 12 && digits.startsWith("55")) {
    digits = digits.substring(2);
  }
  return digits;
}

/**
 * Formata um número de telefone normalizado para exibição (ex: (XX) XXXXX-XXXX).
 */
export function formatPhoneForDisplay(phone: string): string {
  const digits = normalizePhone(phone);
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  } else if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return phone || "";
}
