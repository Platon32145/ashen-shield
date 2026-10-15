import { createClient } from '@supabase/supabase-js'
import { defaultCopy, defaultRuleDescriptions, type CopyKey } from './copy'
export const supabase = import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY ? createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY) : null
export type Content = { title: string; description: string; about: string; rules: string[]; report: string; author: string; copy: Record<CopyKey, string>; ruleDescriptions: string[] }
export type Stock = Record<string, { quantity: number; version: number; updated_at?: string }>
export const defaultContent: Content = {
  copy: { ...defaultCopy }, ruleDescriptions: [...defaultRuleDescriptions],
  title: 'На страже.\nДо последнего рассвета.',
  description: 'Мы храним покой за стенами крепости. Сопровождаем караваны, защищаем земли и стоим плечом к плечу, когда наступает ночь.',
  about: 'Наш орден родился у северных ворот, когда от старой стражи остались лишь пепел и обещание вернуться. Мы подняли щиты и дали клятву: ни одна дорога не будет забыта, ни один союзник не останется один.\n\nСегодня Пепельный Щит — это дозорные, строители и мастера. Мы возводим стены, бережём запасы и пишем историю своими поступками.',
  rules: ['Честь превыше награды', 'Плечом к плечу до конца', 'Каждый ресурс — общее дело'],
  report: 'Восточный тракт свободен. Караван с железом прибыл без потерь. Северная башня укреплена, а в оружейной вновь слышен звон молотов. Ночная стража заступила на пост.',
  author: 'Командор Эйрик · Северный дозор',
}
export function normalizeContent(value: Partial<Content>): Content {
  return { ...defaultContent, ...value, copy: { ...defaultCopy, ...value.copy }, ruleDescriptions: value.ruleDescriptions ?? [...defaultRuleDescriptions] }
}
export const demoStock: Stock = Object.fromEntries(Object.entries({ iron_ingot: 6980, cobblestone: 13824, oak_log: 3500, diamond: 84, gold_ingot: 512, bread: 256, coal: 1728, arrow: 640, emerald: 128, stone_bricks: 6912, spruce_log: 3456, cooked_beef: 192 }).map(([id, quantity]) => [id, { quantity, version: 0 }]))
export function localRead<T>(key: string, fallback: T): T { try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback } catch { return fallback } }
