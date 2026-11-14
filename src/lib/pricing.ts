export function orderTotal(subtotal: number, deliveryFee: number, discount = 0): number {
  return subtotal + deliveryFee - discount;
}
