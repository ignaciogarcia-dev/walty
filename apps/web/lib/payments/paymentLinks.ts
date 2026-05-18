export function getPaymentPath(requestId: string): string {
  return `/pay/${requestId}`
}

export function getAbsolutePaymentUrl(requestId: string, origin: string): string {
  return new URL(getPaymentPath(requestId), origin).toString()
}
