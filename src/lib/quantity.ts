export const MAX_QUANTITY = 1_000_000_000
export function quantity(value: number) {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_QUANTITY) throw new Error('Введите целое число от 0 до 1 000 000 000.')
  return value
}
export function split(total: number, stack: number) {
  quantity(total)
  if (![1, 16, 64, 99].includes(stack)) throw new Error('Некорректный размер стака')
  return { chests: Math.floor(total / (54 * stack)), stacks: Math.floor(total / stack), looseStacks: Math.floor((total % (54 * stack)) / stack), items: total % stack }
}
export function compose(chests: number, stacks: number, items: number, size: number) {
  [chests, stacks, items].forEach(quantity)
  return quantity(chests * 54 * size + stacks * size + items)
}
export const number = (n: number) => n.toLocaleString('ru-RU')
export function formatStacks(total: number, size: number) {
  const p = split(total, size)
  return `${number(p.stacks)} стак.${p.items ? ` + ${p.items} шт.` : ''}`
}
export function formatChests(total: number, size: number) {
  const p = split(total, size)
  return `${number(p.chests)} дв. сун.${p.looseStacks ? ` + ${p.looseStacks} стак.` : ''}${p.items ? ` + ${p.items} шт.` : ''}`
}
