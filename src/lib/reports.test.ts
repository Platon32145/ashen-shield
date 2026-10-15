import { expect, it } from 'vitest'
import { reportAmount, warehouseReport } from './reports'
it('раскладывает изменение, пропуская нулевые единицы', () => {
  expect(reportAmount(2 * 3456 + 34 * 64 + 16,64)).toBe('2 двойных сундука, 34 стака, 16 штук')
  expect(reportAmount(43,64)).toBe('43 штуки')
  expect(reportAmount(3456,64)).toBe('1 двойной сундук')
})
it('различает приход и расход и подписывает именем', () => {
  expect(warehouseReport('Командор Мару','Алмаз',43,64)).toContain('я, Командор Мару, принёс на склад: Алмаз — 43 штуки.')
  expect(warehouseReport('Командор Мару','Алмаз',-43,64)).toContain('забрал со склада')
})
