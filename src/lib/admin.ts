export const LOW_STOCK_THRESHOLD = 3;

export const ORDER_STATUSES = ['pending', 'confirmed', 'packed', 'shipped', 'delivered', 'cancelled'] as const;
export const PAYMENT_STATUSES = ['pending', 'awaiting_payment', 'awaiting_verification', 'paid', 'failed', 'refunded'] as const;

export function formatPaymentStatus(status: string): string {
  return status
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export function formatDate(iso: string): string {
  const date = new Date(iso);
  const hours24 = date.getHours();
  const hours = hours24 % 12 || 12;
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const period = hours24 >= 12 ? 'PM' : 'AM';
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}, ${hours}:${minutes} ${period}`;
}
