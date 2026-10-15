import { mkdir, writeFile, access } from 'node:fs/promises'
const version = '1.21.4'
const get = async (url) => { console.log(`Fetching ${url}`); const r = await fetch(url, { signal: AbortSignal.timeout(20000) }); if (!r.ok) throw new Error(`${r.status}: ${url}`); return r.json() }
const [items, lang] = await Promise.all([
  get(`https://raw.githubusercontent.com/PrismarineJS/minecraft-data/master/data/pc/${version}/items.json`),
  get(`https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/${version}/assets/minecraft/lang/ru_ru.json`),
])
function category(n) {
  if (/sword|helmet|chestplate|leggings|boots|shield|bow|trident|mace|arrow/.test(n)) return 'Снаряжение'
  if (/pickaxe|_axe|shovel|hoe|shears|compass|fishing_rod|clock|brush/.test(n)) return 'Инструменты'
  if (/ingot|_ore|diamond|emerald|netherite|coal|raw_|lapis|quartz|amethyst|ancient_debris/.test(n)) return 'Руды и минералы'
  if (/apple|bread|beef|porkchop|chicken|mutton|rabbit|stew|soup|potato|carrot|cookie|cake|cod|salmon|melon_slice|berries|pie|honey_bottle|dried_kelp/.test(n)) return 'Провизия'
  if (/redstone|piston|hopper|repeater|comparator|observer|dispenser|dropper|rail|lever|button|pressure_plate|daylight|target|tnt/.test(n)) return 'Механизмы'
  if (/sapling|leaves|flower|tulip|seed|wheat|moss|grass|fern|vine|bamboo|cactus|mushroom|roots|kelp|sugar_cane|poppy|dandelion|azalea/.test(n)) return 'Растения'
  if (/stone|dirt|sand|gravel|planks|log|wood|slab|stairs|wall|brick|concrete|terracotta|glass|wool|copper|block|deepslate|tuff|basalt|obsidian|prismarine|purpur/.test(n)) return 'Блоки'
  return 'Прочее'
}
await mkdir('src/data', { recursive: true })
await mkdir('public/items', { recursive: true })
const rows = items.filter(i => i.name !== 'air').map(i => ({ id: i.name, name: lang[`item.minecraft.${i.name}`] || lang[`block.minecraft.${i.name}`] || i.displayName, stack: i.stackSize, category: category(i.name), icon: '' }))
await writeFile('src/data/items.json', JSON.stringify(rows))
let index = 0, downloaded = 0
await Promise.all(Array.from({ length: 16 }, async () => {
  while (index < rows.length) {
    const item = rows[index++]
    try { await access(`public/items/${item.id}.png`); item.icon = `${item.id}.png`; downloaded++; continue } catch { /* Download only missing textures. */ }
    for (const kind of ['item', 'block']) {
      try {
        const r = await fetch(`https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/${version}/assets/minecraft/textures/${kind}/${item.id}.png`, { signal: AbortSignal.timeout(6000) })
        if (r.ok) { await writeFile(`public/items/${item.id}.png`, Buffer.from(await r.arrayBuffer())); item.icon = `${item.id}.png`; downloaded++; break }
      } catch { /* Some technical items do not have a standalone texture. */ }
    }
  }
}))
await writeFile('src/data/items.json', JSON.stringify(rows))
console.log(`Minecraft ${version}: ${rows.length} items, ${downloaded} local textures.`)
