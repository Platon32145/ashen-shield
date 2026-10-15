import { describe, expect, it } from 'vitest'
import { compose, split, quantity, formatStacks, formatChests } from './quantity'
describe('склад: точный пересчёт', () => {
  it.each([0, 1, 64, 65, 84, 3456, 3457, 1_000_000_000])('обратимость для %s', total => {
    for (const size of [1, 16, 64]) { const p = split(total, size); expect(compose(p.chests, p.looseStacks, p.items, size)).toBe(total) }
  })
  it('84 предмета без дробей', () => { expect(formatStacks(84, 64)).toBe('1 стак. + 20 шт.'); expect(formatChests(84, 64)).toBe('0 дв. сун. + 1 стак. + 20 шт.') })
  it('учитывает стаки по 16 и по 1', () => { expect(split(864, 16).chests).toBe(1); expect(split(54, 1).chests).toBe(1) })
  it.each([-1, 1.5, NaN, Infinity, 1_000_000_001])('отклоняет %s', n => expect(() => quantity(n)).toThrow())
})
