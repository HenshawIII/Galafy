export function toAmountNumber(value: { toFixed: (digits: number) => string } | string | number): number {
  if (typeof value === 'number') {
    return value;
  }
  if (typeof value === 'string') {
    return Number(value);
  }
  return Number(value.toFixed(2));
}
