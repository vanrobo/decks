export function uid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `b-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}
