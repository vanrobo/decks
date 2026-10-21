/** Natural / version-aware filename compare: 1, 2, 9, 9.5, 10 */
export function naturalCompare(a: string, b: string): number {
  const ax: (string | number)[] = []
  const bx: (string | number)[] = []
  a.replace(/(\d+\.?\d*|\D+)/g, (_, tok: string) => {
    ax.push(/\d/.test(tok) ? parseFloat(tok) : tok.toLowerCase())
    return ''
  })
  b.replace(/(\d+\.?\d*|\D+)/g, (_, tok: string) => {
    bx.push(/\d/.test(tok) ? parseFloat(tok) : tok.toLowerCase())
    return ''
  })
  const n = Math.max(ax.length, bx.length)
  for (let i = 0; i < n; i++) {
    const x = ax[i]
    const y = bx[i]
    if (x === undefined) return -1
    if (y === undefined) return 1
    if (typeof x === 'number' && typeof y === 'number') {
      if (x !== y) return x - y
      continue
    }
    const xs = String(x)
    const ys = String(y)
    if (xs !== ys) return xs < ys ? -1 : 1
  }
  return 0
}

export function naturalSortByName<T>(items: T[], getName: (item: T) => string): T[] {
  return [...items].sort((a, b) => naturalCompare(getName(a), getName(b)))
}
