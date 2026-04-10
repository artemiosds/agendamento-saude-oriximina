/**
 * Centralized phone number normalization, formatting, and validation utilities.
 * All phone numbers in the database must be stored as 13 digits starting with "55".
 * Example: 5593999990000
 */

/**
 * Normalize a phone number to the canonical 13-digit format starting with "55".
 * Returns the normalized string or null if the input is invalid/empty.
 *
 * Rules:
 * 1. Strip all non-digit characters
 * 2. Remove leading 0
 * 3. If 10 digits → insert 9 after DDD (2 digits)
 * 4. If 11 digits → prepend 55
 * 5. If 13 digits starting with 55 → keep
 * 6. Must result in exactly 13 digits starting with 55
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;

  let digits = raw.replace(/\D/g, "");
  if (digits.length === 0) return null;

  // Remove leading 0
  if (digits.startsWith("0")) {
    digits = digits.slice(1);
  }

  // 10 digits (DDD + 8-digit landline/old mobile) → insert 9 after DDD
  if (digits.length === 10 && !digits.startsWith("55")) {
    digits = digits.slice(0, 2) + "9" + digits.slice(2);
  }

  // 11 digits (DDD + 9-digit mobile) → prepend 55
  if (digits.length === 11 && !digits.startsWith("55")) {
    digits = "55" + digits;
  }

  // 12 digits starting with 55 (55 + DDD + 8 digits) → insert 9
  if (digits.length === 12 && digits.startsWith("55")) {
    digits = digits.slice(0, 4) + "9" + digits.slice(4);
  }

  // Validate final result
  if (digits.length === 13 && digits.startsWith("55")) {
    return digits;
  }

  return null;
}

/**
 * Check if a normalized phone number is valid for WhatsApp sending.
 */
export function isValidNormalizedPhone(phone: string | null | undefined): boolean {
  if (!phone) return false;
  return phone.length === 13 && phone.startsWith("55") && /^\d+$/.test(phone);
}

/**
 * Format a stored 13-digit phone for display: (93) 99999-0000
 */
export function formatPhoneForDisplay(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");

  // Try to format 13-digit numbers (55 + DDD + number)
  if (digits.length === 13 && digits.startsWith("55")) {
    const ddd = digits.slice(2, 4);
    const part1 = digits.slice(4, 9);
    const part2 = digits.slice(9, 13);
    return `(${ddd}) ${part1}-${part2}`;
  }

  // Try to format 11-digit numbers (DDD + number)
  if (digits.length === 11) {
    const ddd = digits.slice(0, 2);
    const part1 = digits.slice(2, 7);
    const part2 = digits.slice(7, 11);
    return `(${ddd}) ${part1}-${part2}`;
  }

  // Fallback: return raw
  return phone;
}

/**
 * Apply input mask as the user types: (93) 99999-0000
 * This returns the masked display value.
 */
export function applyPhoneMask(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 11); // max 11 digits (DDD + 9 digits)

  if (digits.length === 0) return "";
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}
