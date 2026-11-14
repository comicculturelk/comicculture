export const PHONE_INPUT_LIMIT = 24;

export function compactPhone(value: string): string {
  return value.replace(/[ -]/g, '');
}

export function normalizeSriLankanPhone(value: unknown, mobileOnly = false): string | null {
  if (typeof value !== 'string' || value.length > PHONE_INPUT_LIMIT) return null;
  // Spaces and single hyphens can separate digit groups. Keep all other characters significant.
  const trimmed = value.replace(/^ +| +$/g, '');
  if (!/^(?:\+94[ -]?)?[0-9]+(?:[ -][0-9]+)*$/.test(trimmed) || /[^0-9+ -]/.test(trimmed)) return null;
  const compact = compactPhone(trimmed);
  const national = compact.startsWith('+94') ? '0' + compact.slice(3) : compact;
  const pattern = mobileOnly ? /^07[0-9]{8}$/ : /^0[1-9][0-9]{8}$/;
  return pattern.test(national) ? national : null;
}

export const CHECKOUT_DISTRICTS = [
  'Ampara', 'Anuradhapura', 'Badulla', 'Batticaloa', 'Colombo', 'Galle',
  'Gampaha', 'Hambantota', 'Jaffna', 'Kalutara', 'Kandy', 'Kegalle',
  'Kilinochchi', 'Kurunegala', 'Mannar', 'Matale', 'Matara', 'Moneragala',
  'Mullaitivu', 'Nuwara Eliya', 'Polonnaruwa', 'Puttalam', 'Ratnapura',
  'Trincomalee', 'Vavuniya',
];

export const CONTACT_LIMITS = {
  fullName: 150, email: 254, addressLine1: 300, addressLine2: 300, city: 100, postalCode: 5,
} as const;

export const CHECKOUT_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const CHECKOUT_POSTAL_CODE = /^[0-9]{5}$/;
