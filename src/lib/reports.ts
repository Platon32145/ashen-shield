import { split } from './quantity'
export type Report = { id: number; author: string; kind: 'manual' | 'warehouse'; body: string; created_at: string; changes?: unknown[] }
function unit(n: number, forms: string[]) { return `${n} ${forms[n % 100 >= 11 && n % 100 <= 14 ? 2 : n % 10 === 1 ? 0 : n % 10 >= 2 && n % 10 <= 4 ? 1 : 2]}` }
export function reportAmount(total: number, size: number) {
  const p = split(total, size)
  return [p.chests ? unit(p.chests, ['двойной сундук','двойных сундука','двойных сундуков']) : '', p.looseStacks ? unit(p.looseStacks, ['стак','стака','стаков']) : '', p.items ? unit(p.items, ['штуку','штуки','штук']) : ''].filter(Boolean).join(', ')
}
export function warehouseReport(author: string, name: string, delta: number, size: number, date = new Date()) {
  const day = date.toLocaleDateString('ru-RU', { timeZone: 'Europe/Moscow' }), time = date.toLocaleTimeString('ru-RU', { timeZone: 'Europe/Moscow', hour: '2-digit', minute: '2-digit' })
  return `Сегодня ${day} в ${time} (МСК) я, ${author}, ${delta > 0 ? 'принёс на склад' : 'забрал со склада'}: ${name} — ${reportAmount(Math.abs(delta), size)}.`
}
