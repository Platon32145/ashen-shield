import { Children, cloneElement, isValidElement, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { ArrowRight, ArrowUpRight, Shield, Swords, Package, Search, LockKeyhole, X, LogOut, Feather, Check, ChevronLeft, ChevronRight, Pencil, Download, RefreshCw } from 'lucide-react'
import itemsData from './data/items.json'
import { defaultContent, demoStock, localRead, normalizeContent, supabase, type Content, type Stock } from './lib/store'
import ContentEditor from './components/ContentEditor'
import ReportsPage from './components/ReportsPage'
import { warehouseReport, type Report } from './lib/reports'
import { defaultCopy, defaultRuleDescriptions, type CopyKey } from './lib/copy'
import { compose, split, number, formatChests, formatStacks, quantity } from './lib/quantity'
type Item = { id: string; name: string; stack: number; category: string; icon: string }
const items: Item[] = itemsData
const categories = [...new Set(items.map(i => i.category))]
const route = () => location.hash.slice(1).split('?')[0] || '/'
function Crest({ large = false }: { large?: boolean }) { return <img className={large ? 'crest large' : 'crest'} src={`${import.meta.env.BASE_URL}crest.svg`} alt="Герб Пепельного Щита" /> }
function Modal({ title, close, children }: { title: string; close: () => void; children: React.ReactNode }) {
  const closeRef = useRef(close)
  closeRef.current = close
  useEffect(() => { const last = document.activeElement as HTMLElement; const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current(); if (e.key === 'Tab') { const nodes = [...document.querySelectorAll<HTMLElement>('.modal button, .modal input, .modal textarea')].filter(n => !n.hasAttribute('disabled')); if (!nodes.length) return; if (e.shiftKey && document.activeElement === nodes[0]) { e.preventDefault(); nodes.at(-1)?.focus() } else if (!e.shiftKey && document.activeElement === nodes.at(-1)) { e.preventDefault(); nodes[0].focus() } } }; document.addEventListener('keydown', handler); document.querySelector<HTMLElement>('.modal input, .modal button')?.focus(); return () => { document.removeEventListener('keydown', handler); last?.focus() } }, [])
  return <div className="overlay" onMouseDown={e => { if (e.target === e.currentTarget) close() }}><section role="dialog" aria-modal="true" aria-label={title} className="modal"><button className="close icon-button" onClick={close} aria-label="Закрыть"><X size={20}/></button><span className="eyebrow">АРХИВ ОРДЕНА</span><h2>{title}</h2>{children}</section></div>
}
export default function App() {
  const [path, setPath] = useState(route)
  const [content, setContent] = useState<Content>(() => supabase ? defaultContent : normalizeContent(localRead('guild-content', defaultContent)))
  const [stock, setStock] = useState<Stock>(() => supabase ? {} : localRead('guild-stock', demoStock))
  const [admin, setAdmin] = useState(false), [operator, setOperator] = useState(false), [login, setLogin] = useState(false), [busy, setBusy] = useState(false)
  const [author, setAuthor] = useState('Страж'), [reportOpen, setReportOpen] = useState(false), [reportText, setReportText] = useState('')
  const [reports, setReports] = useState<Report[]>(() => supabase ? [] : localRead('guild-reports', []))
  const [latest, setLatest] = useState<Report | null>(() => supabase ? null : localRead<Report[]>('guild-reports', [])[0] || null)
  const [loading, setLoading] = useState(!!supabase), [error, setError] = useState(''), [toast, setToast] = useState('')
  const [draft, setDraft] = useState<Content | null>(null), [editing, setEditing] = useState<{ item: Item; mode: string } | null>(null)
  const [values, setValues] = useState(['0', '0', '0']), [inputError, setInputError] = useState('')
  const params = new URLSearchParams(location.hash.split('?')[1])
  const [search, setSearch] = useState(params.get('q') || ''), [category, setCategory] = useState(params.get('category') || ''), [sort, setSort] = useState(params.get('sort') || 'quantity-desc'), [available, setAvailable] = useState(params.get('available') === '1'), [page, setPage] = useState(1)
  useEffect(() => { document.title = `${content.copy['ПЕПЕЛЬНЫЙ ЩИТ']} — ${content.copy['ГИЛЬДИЯ СТРАЖЕЙ']}` }, [content])
  useEffect(() => {
    if (path === '/warehouse' || path === '/reports' || matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const observer = new IntersectionObserver(entries => entries.forEach(entry => { if (entry.isIntersecting) { entry.target.classList.add('revealed'); observer.unobserve(entry.target) } }), { threshold: 0.08 })
    document.querySelectorAll('.about, .code, .archive, .rules article').forEach(el => { el.classList.add('reveal'); observer.observe(el) })
    return () => observer.disconnect()
  }, [path])
  // Translate the public JSX tree from one editable dictionary, keeping controls and values intact.
  function publicCopy(node: ReactNode): ReactNode {
    return Children.map(node, child => {
      if (typeof child === 'string') {
        const key = child.trim()
        const ruleIndex = defaultRuleDescriptions.indexOf(key)
        const replacement = key in defaultCopy ? content.copy[key as CopyKey] : ruleIndex >= 0 ? content.ruleDescriptions[ruleIndex] : undefined
        return replacement === undefined ? child : child.replace(key, replacement)
      }
      if (isValidElement<{ children?: ReactNode }>(child) && child.props.children && child.type !== ContentEditor) return cloneElement(child, {}, publicCopy(child.props.children))
      return child
    })
  }
  useEffect(() => { const h = () => setPath(route()); addEventListener('hashchange', h); return () => removeEventListener('hashchange', h) }, [])
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 4000); return () => clearTimeout(t) }, [toast])
  useEffect(() => {
    if (!supabase) return
    const timer = setInterval(async () => { if (document.visibilityState !== 'visible') return; const { data } = await supabase!.rpc('latest_report'); if (data?.[0]) setLatest(data[0]) }, 5000)
    return () => clearInterval(timer)
  }, [])
  useEffect(() => { const h = (e: BeforeUnloadEvent) => { if (draft) e.preventDefault() }; addEventListener('beforeunload', h); return () => removeEventListener('beforeunload', h) }, [draft])
  async function load() {
    if (!supabase) return
    setLoading(true); setError('')
    const [a, first, second] = await Promise.all([supabase.from('site_content').select('content').eq('id', 1).single(), supabase.from('warehouse_items').select('*').order('item_id').range(0, 999), supabase.from('warehouse_items').select('*').order('item_id').range(1000, 1999)])
    const b = { error: first.error || second.error, data: [...(first.data || []), ...(second.data || [])] }
    if (a.error || b.error) setError('Не удалось прочитать архив. Проверьте подключение и SQL-настройку Supabase.')
    else { setContent(normalizeContent(a.data.content)); setStock(Object.fromEntries(b.data.map(r => [r.item_id, { quantity: r.total_quantity, version: r.version, updated_at: r.updated_at }]))) }
    setLoading(false)
    const { data: recent } = await supabase.rpc('latest_report')
    if (recent?.[0]) setLatest(recent[0])
  }
  async function loadAuthor() {
    if (!supabase) return
    const { data } = await supabase.rpc('report_author')
    if (data) setAuthor(data)
  }
  function addLocalReport(report: Report) { const next = [report, ...reports]; setReports(next); setLatest(report); localStorage.setItem('guild-reports', JSON.stringify(next)) }
  async function sendReport(e: FormEvent) {
    e.preventDefault(); if (!operator || !reportText.trim()) return
    setBusy(true); setInputError('')
    if (supabase) { const { error } = await supabase.rpc('submit_report', { p_body: reportText.trim() }); if (error) { setInputError(`Не удалось отправить рапорт: ${error.message}. Проверьте миграцию 003_reports.sql.`); setBusy(false); return } await load() }
    else addLocalReport({ id: Date.now(), author, kind: 'manual', body: reportText.trim(), created_at: new Date().toISOString() })
    setReportOpen(false); setReportText(''); setBusy(false); notify('Рапорт отправлен и опубликован на главной.')
  }
  useEffect(() => {
    if (!supabase) return
    void load()
    let alive = true
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
       if (!session) { setAdmin(false); setOperator(false); return }
       setTimeout(() => {
         void Promise.all([supabase!.rpc('is_admin'), supabase!.rpc('is_warehouse_operator')]).then(([administrator, warehouseOperator]) => {
           if (alive) { setAdmin(administrator.data === true); setOperator(warehouseOperator.data === true); if (warehouseOperator.data === true) void loadAuthor() }
         })
       }, 0)
    })
    const refresh = () => { if (document.visibilityState === 'visible') void load() }
    document.addEventListener('visibilitychange', refresh)
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void load() }, 60000)
    return () => { alive = false; data.subscription.unsubscribe(); document.removeEventListener('visibilitychange', refresh); clearInterval(timer) }
  }, [])
  useEffect(() => { setPage(1); if (path !== '/warehouse') return; const p = new URLSearchParams(); if (search) p.set('q', search); if (category) p.set('category', category); p.set('sort', sort); if (available) p.set('available', '1'); history.replaceState(null, '', `#/warehouse?${p}`) }, [search, category, sort, available, path])
  const filtered = items.filter(i => (!category || i.category === category) && (!available || (stock[i.id]?.quantity || 0) > 0) && `${i.name} minecraft:${i.id} ${i.category}`.toLowerCase().includes(search.toLowerCase())).sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name, 'ru') : sort === 'category' ? a.category.localeCompare(b.category, 'ru') || a.name.localeCompare(b.name, 'ru') : sort === 'quantity-asc' ? (stock[a.id]?.quantity || 0) - (stock[b.id]?.quantity || 0) : sort === 'chests' ? (stock[b.id]?.quantity || 0) / b.stack - (stock[a.id]?.quantity || 0) / a.stack : (stock[b.id]?.quantity || 0) - (stock[a.id]?.quantity || 0))
  const pages = Math.max(1, Math.ceil(filtered.length / 40)), current = Math.min(page, pages)
  const total = Object.values(stock).reduce((a, b) => a + b.quantity, 0), stocked = Object.values(stock).filter(s => s.quantity > 0).length
  const chestTotal = items.reduce((sum, i) => sum + Math.floor((stock[i.id]?.quantity || 0) / (54 * i.stack)), 0)
  const updated = Object.values(stock).map(s => s.updated_at || '').sort().at(-1)
  const notify = (message: string) => setToast(message)
  async function signIn(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!supabase) return; setBusy(true); setInputError('')
    const form = new FormData(e.currentTarget)
    const { error } = await supabase.auth.signInWithPassword({ email: String(form.get('email')), password: String(form.get('password')) })
    if (error) setInputError('Не удалось войти. Проверьте почту и пароль.')
    else {
      const [{ data: administrator }, { data: warehouseOperator }] = await Promise.all([supabase.rpc('is_admin'), supabase.rpc('is_warehouse_operator')])
      if (warehouseOperator !== true) { await supabase.auth.signOut(); setInputError('У этого аккаунта нет прав склада или администратора.') }
      else { setAdmin(administrator === true); setOperator(true); setLogin(false); notify('Добро пожаловать в архив, командор.') }
    }
    setBusy(false)
  }
  function openQuantity(item: Item, mode: string) { const total = stock[item.id]?.quantity || 0, p = split(total, item.stack); setValues(mode === 'total' ? [String(total), '0', '0'] : mode === 'stacks' ? ['0', String(p.stacks), String(p.items)] : [String(p.chests), String(p.looseStacks), String(p.items)]); setInputError(''); setEditing({ item, mode }) }
  async function saveQuantity(e: FormEvent) {
    e.preventDefault(); if (!editing || !operator) return
    let n: number
    try { if (values.some(v => !/^\d+$/.test(v))) throw new Error('Заполните поля целыми неотрицательными числами.'); n = editing.mode === 'total' ? quantity(Number(values[0])) : compose(...values.map(Number) as [number, number, number], editing.item.stack) } catch (e) { setInputError((e as Error).message); return }
    setBusy(true)
    const id = editing.item.id, previous = stock[id]
    if (supabase) { const { error } = await supabase.rpc('set_quantity', { p_id: id, p_quantity: n, p_version: previous?.version ?? -1, p_name: editing.item.name, p_stack: editing.item.stack }); if (error) { setInputError(error.message.includes('conflict') ? 'Запись изменил другой администратор. Обновите склад и повторите.' : `Не удалось сохранить: ${error.message}. Проверьте миграцию 003_reports.sql.`); setBusy(false); return } }
    const next = { ...stock, [id]: { quantity: n, version: (previous?.version ?? -1) + 1, updated_at: new Date().toISOString() } }; setStock(next)
    if (!supabase) localStorage.setItem('guild-stock', JSON.stringify(next))
    const delta = n - (previous?.quantity || 0)
    if (!supabase && delta) addLocalReport({ id: Date.now(), author, kind: 'warehouse', body: warehouseReport(author, editing.item.name, delta, editing.item.stack), created_at: new Date().toISOString() })
    if (supabase) await load()
    setBusy(false); setEditing(null); notify('Количество сохранено. Все колонки пересчитаны.')
  }
  async function saveContent(e: FormEvent) {
    e.preventDefault(); if (!draft || !admin) return; setBusy(true); setInputError('')
    if (supabase) {
      try {
        const { data, error } = await supabase.from('site_content').update({ content: draft }).eq('id', 1).select('id').single()
        if (error) throw error
        if (!data) throw new Error('Нет доступа к записи главной страницы. Проверьте роль администратора.')
      } catch (error) {
        const detail = error as { message?: string; code?: string }
        setInputError(`Не удалось сохранить текст: ${detail.message || 'Ошибка соединения'}${detail.code ? ` (код ${detail.code})` : ''}. Если база создана ранее, выполните 002_fix_content_save.sql в Supabase SQL Editor.`)
        setBusy(false); return
      }
    }
    else localStorage.setItem('guild-content', JSON.stringify(draft))
    setContent(draft); setDraft(null); setBusy(false); notify('Летопись обновлена.')
  }
  function exportCsv() { const text = '\ufeffПредмет;Minecraft ID;Категория;Размер стака;Количество\n' + filtered.map(i => [i.name, i.id, i.category, i.stack, stock[i.id]?.quantity || 0].map(v => `"${String(v).replaceAll('"', '""')}"`).join(';')).join('\n'); const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' })); const a = document.createElement('a'); a.href = url; a.download = 'guild-warehouse.csv'; a.click(); URL.revokeObjectURL(url) }
  return publicCopy(<><a className="skip" href="#main">К содержимому</a><header className="header"><a href="#/" className="brand"><Crest/><span>ПЕПЕЛЬНЫЙ ЩИТ<small>ГИЛЬДИЯ СТРАЖЕЙ</small></span></a><nav aria-label="Основная навигация"><a className={path !== '/warehouse' ? 'active' : ''} href="#/">Главная</a><a className={path === '/warehouse' ? 'active' : ''} href="#/warehouse">Склад <span className="nav-count">{stocked}</span></a></nav><div className="header-right"><span className="server-label"><i/> MINECRAFT RP</span>{operator ? <button className="admin-button" onClick={async () => { if (supabase) await supabase.auth.signOut(); setAdmin(false); setOperator(false) }}><LogOut size={14}/> Выйти</button> : <button className="admin-button" onClick={() => { setInputError(''); setLogin(true) }}><LockKeyhole size={14}/><span>Вход в архив</span></button>}</div></header>
  {!supabase && <div className="demo-banner">Локальный предпросмотр <span>· Данные хранятся в этом браузере. Общий архив подключается через Supabase.</span></div>}
  {error && <div className="error-banner" role="alert">{error} <button onClick={() => void load()}>Повторить</button></div>}
  {operator && <nav className="admin-navigation wrap" aria-label="Административная навигация"><a className={path === '/reports' ? 'active' : ''} href="#/reports">Отчёты и рапорты</a><button onClick={() => { setInputError(''); setReportOpen(true) }}><Feather size={15}/> Отправить рапорт</button></nav>}
  <main id="main">{path === '/reports' ? operator ? <ReportsPage localReports={reports} signature={content.copy['ГИЛЬДИЯ СТРАЖЕЙ']}/> : <section className="wrap reports-page"><h1>Архив рапортов</h1><p>Войдите как интендант или администратор для доступа к отчётам.</p></section> : path === '/warehouse' ? <div className="warehouse wrap"><div className="page-heading"><div><span className="eyebrow">АРХИВ ОРДЕНА / РЕЕСТР РЕСУРСОВ</span><h1>Склад крепости<span className="gold">.</span></h1><p>Всё, что нужно для следующего рассвета.</p></div><button className="secondary" onClick={exportCsv}><Download size={16}/> Скачать реестр</button></div>
     <div className="warehouse-stats"><div><Package size={20}/><span><strong>{number(total)}</strong><small>предметов на хранении</small></span></div><div><Shield size={20}/><span><strong>{stocked} / {items.length}</strong><small>позиций в наличии</small></span></div><div><span className="status-dot"/><span><strong>{operator ? 'Доступ интенданта' : 'Открытый реестр'}</strong><small>{updated ? `Обновлено ${new Date(updated).toLocaleString('ru-RU')}` : 'Запасы готовы к учёту'}</small></span></div></div>
    <div className="filters"><label className="search"><Search size={18}/><input aria-label="Поиск предмета" placeholder="Название или minecraft:id…" value={search} onChange={e => setSearch(e.target.value)}/>{search && <button className="icon-button" onClick={() => setSearch('')} aria-label="Очистить поиск"><X size={16}/></button>}</label><select aria-label="Категория" value={category} onChange={e => setCategory(e.target.value)}><option value="">Все категории</option>{categories.map(c => <option key={c}>{c}</option>)}</select><select aria-label="Сортировка" value={sort} onChange={e => setSort(e.target.value)}><option value="quantity-desc">Больше ресурсов</option><option value="quantity-asc">Меньше ресурсов</option><option value="name">По названию</option><option value="category">По категории</option><option value="chests">По сундукам</option></select><label className="checkbox"><input type="checkbox" checked={available} onChange={e => setAvailable(e.target.checked)}/> В наличии</label></div>
     <div className="table-caption"><span>{loading ? 'Читаем архив…' : `Найдено ${number(filtered.length)} предметов`} <span className="muted">/ Java 1.21.4</span></span><span>{operator ? 'Нажмите на количество для изменения' : 'Только чтение'} {supabase && <button className="icon-button" aria-label="Обновить" onClick={() => void load()}><RefreshCw size={14}/></button>}</span></div>
     <div className="table-scroll"><table><thead><tr><th>ПРЕДМЕТ</th><th>КАТЕГОРИЯ</th><th>ДВОЙНЫЕ СУНДУКИ <small>54 слота</small></th><th>СТАКИ</th><th>ИТОГ <small>шт.</small></th></tr></thead><tbody>{filtered.slice((current - 1) * 40, current * 40).map(i => { const n = stock[i.id]?.quantity || 0; return <tr key={i.id} className={!n ? 'empty-row' : ''}><td><div className="item"><div className="item-image">{i.icon ? <img loading="lazy" width="32" height="32" src={`${import.meta.env.BASE_URL}items/${i.icon}`} alt=""/> : <Package size={25}/>}</div><span>{i.name}<small>minecraft:{i.id} · стак {i.stack}</small></span></div></td><td><span className="category-label">{i.category}</span></td>{(['chests', 'stacks', 'total'] as const).map(mode => <td key={mode}>{operator ? <button disabled={loading} className="quantity-button" onClick={() => openQuantity(i, mode)}>{mode === 'total' ? number(n) : mode === 'stacks' ? formatStacks(n, i.stack) : formatChests(n, i.stack)}<Pencil size={11}/></button> : <span className={mode === 'total' ? 'total-cell' : 'quantity-cell'}>{mode === 'total' ? number(n) : mode === 'stacks' ? formatStacks(n, i.stack) : formatChests(n, i.stack)}</span>}</td>)}</tr> })}</tbody></table>{!filtered.length && <div className="empty-state"><Search size={30}/><h3>В архиве ничего не найдено</h3><p>Попробуйте другой запрос или снимите фильтры.</p><button className="secondary" onClick={() => { setSearch(''); setCategory(''); setAvailable(false) }}>Сбросить фильтры</button></div>}</div>
    <div className="pagination"><span>Размер стака учитывается отдельно для каждого предмета.</span><div><button aria-label="Предыдущая страница" disabled={current === 1} onClick={() => setPage(current - 1)}><ChevronLeft size={18}/></button><span>{current} / {pages}</span><button aria-label="Следующая страница" disabled={current === pages} onClick={() => setPage(current + 1)}><ChevronRight size={18}/></button></div></div></div> : <>
    <section className="hero wrap"><div className="hero-copy"><div className="eyebrow"><span className="tiny-line"/> ЧЕСТЬ. ЕДИНСТВО. ДОЛГ.</div><h1>{content.title}</h1><p>{content.description}</p><div className="hero-actions"><a className="primary" href="#/warehouse">Открыть склад <ArrowRight size={18}/></a><a href="#about" onClick={e => { e.preventDefault(); document.getElementById('about')?.scrollIntoView({ behavior: 'smooth' }) }} className="text-link">Об ордене <ArrowUpRight size={16}/></a></div><div className="hero-note"><span className="status-dot"/> Дозор не заканчивается с заходом солнца</div></div><div className="heraldry" aria-hidden="true"><div className="orbit outer"/><div className="orbit inner"/><span className="compass north">N</span><span className="compass south">S</span><span className="compass east">E</span><span className="compass west">W</span><div className="crest-glow"/><Crest large/><span className="crest-caption">ORDO CINERIS · FIDES ET VIRTUS</span><span className="coordinate">СЕВЕРНАЯ КРЕПОСТЬ<br/>X: −384 · Z: 1208</span><span className="seal-note">СЛУЖИМ НЕ КОРОНЕ.<br/>СЛУЖИМ ДРУГ ДРУГУ.</span></div></section>
    <div className="motto-strip"><span>СТОИМ НА СТРАЖЕ</span><span>◆</span><span>ХРАНИМ ЗАПАСЫ</span><span>◆</span><span>ДЕРЖИМ СЛОВО</span><span>◆</span><span>ПОМИНИМ ПАВШИХ</span></div>
    <section className="about wrap" id="about"><div className="section-marker">01 / ЛЕТОПИСЬ</div><div><span className="eyebrow">НЕ ПРОСТО ГИЛЬДИЯ. БРАТСТВО.</span><h2>Из пепла —<br/>единым щитом.</h2></div><div className="about-text"><p>{content.about}</p><span className="signature">Печать Совета стражей <Feather size={22}/></span></div></section>
    <section className="code wrap"><div className="section-marker">02 / НАШ КОДЕКС</div><div className="code-heading"><h2>Три слова. Одна клятва.</h2><p>То, что остаётся с нами, когда гаснут факелы.</p></div><div className="rules">{content.rules.map((r, i) => { const Icon = [Shield, Swords, Package][i]; return <article key={i}><span className="rule-number">0{i + 1}</span><Icon size={28} strokeWidth={1.3}/><h3>{r}</h3><p>{['Мы держим слово даже тогда, когда никто не смотрит. Наше имя дороже любого изумруда.', 'Ни один страж не остаётся один. В мирный час и в последнем бою мы рядом.', 'От первого бревна до последнего слитка. Общий запас — сила всей крепости.'][i]}</p></article> })}</div></section>
    <section className="archive wrap"><div className="report"><span className="eyebrow"><Feather size={15}/> ПОСЛЕДНИЙ РАПОРТ</span><blockquote>«{latest?.body || content.report}»</blockquote><span className="report-author">{latest?.author || content.author} — {content.copy['ГИЛЬДИЯ СТРАЖЕЙ']}</span><div className="report-bottom"><span className="status-dot"/> ПОД ПЕЧАТЬЮ ОРДЕНА <Shield size={35} strokeWidth={1}/></div></div><div className="supply"><span className="eyebrow">03 / ИНТЕНДАНТСКАЯ СЛУЖБА</span><h2>Крепость начинается<br/>с запасов.</h2><p>Каждый слиток на счету. Открытый реестр ресурсов — для тех, кто строит наше завтра.</p><div className="supply-numbers"><div><strong>{number(stocked)}</strong><span>позиций в наличии</span></div><div><strong>{number(chestTotal)}</strong><span>полных двойных сундуков</span></div></div><a className="text-link" href="#/warehouse">Перейти к реестру <ArrowRight size={17}/></a></div></section>
    {admin && <div className="admin-dock"><Shield size={16}/><span>{supabase ? 'Режим администратора' : 'Локальный редактор'}</span><button onClick={() => { setInputError(''); setDraft(structuredClone(content)) }}><Pencil size={14}/> Изменить текст главной</button></div>}
  </>}</main><footer className="wrap"><a className="footer-brand" href="#/"><Crest/>ПЕПЕЛЬНЫЙ ЩИТ</a><span>Не ради славы. Ради тех, кто за стеной.</span><small>{content.copy['НЕОФИЦИАЛЬНЫЙ MINECRAFT RP ПРОЕКТ']}{' · '}{new Date().getFullYear()}</small></footer>
    {reportOpen && operator && <Modal title="Отправить рапорт" close={() => { if (!busy) setReportOpen(false) }}><form onSubmit={sendReport}><p className="muted">Запись попадёт в архив и станет последним рапортом на главной.</p><label>Текст рапорта<textarea required maxLength={12000} rows={8} value={reportText} onChange={e => setReportText(e.target.value)}/></label><p className="report-author">{author} — {content.copy['ГИЛЬДИЯ СТРАЖЕЙ']}</p>{inputError && <p className="form-error" role="alert">{inputError}</p>}<button className="primary" disabled={busy}>{busy ? 'Отправляем…' : 'Отправить рапорт'}<Feather size={16}/></button></form></Modal>}
  {login && <Modal title={supabase ? 'Вход в архив' : 'Локальный редактор'} close={() => setLogin(false)}>{supabase ? <form onSubmit={signIn}><p className="muted">Доступ для командоров и интендантов ордена.</p><label>Электронная почта<input name="email" type="email" autoComplete="email" required/></label><label>Пароль<input name="password" type="password" autoComplete="current-password" required/></label>{inputError && <p role="alert" className="form-error">{inputError}</p>}<button className="primary" disabled={busy}>{busy ? 'Проверяем печать…' : 'Войти'}<ArrowRight size={16}/></button></form> : <><p>Сервис общей базы ещё не подключён. Можно попробовать редактор: изменения сохранятся только в этом браузере.</p><p className="muted">Для защищённого входа и общих данных выполните настройку Supabase из README.md.</p><button className="primary" onClick={() => { setAdmin(true); setLogin(false); notify('Локальный редактор включён') }}>Открыть локальный редактор <ArrowRight size={16}/></button></>}</Modal>}
  {editing && <Modal title={editing.item.name} close={() => { if (!busy) setEditing(null) }}><p className="muted">Стак: {editing.item.stack} шт. · Двойной сундук: {54 * editing.item.stack} шт.</p><form onSubmit={saveQuantity}><div className="quantity-fields">{(editing.mode === 'total' ? [0] : editing.mode === 'stacks' ? [1, 2] : [0, 1, 2]).map(i => <label key={i}>{editing.mode === 'total' ? 'Всего, штук' : ['Двойные сундуки', 'Стаки', 'Штуки'][i]}<input type="number" min="0" step="1" max="1000000000" required value={values[i]} onChange={e => setValues(v => v.map((s, j) => j === i ? e.target.value : s))}/></label>)}</div>{inputError && <p role="alert" className="form-error">{inputError}</p>}<button disabled={busy} className="primary">{busy ? 'Сохраняем…' : 'Сохранить количество'}<Check size={17}/></button><p className="muted">Остальные колонки будут пересчитаны автоматически. Нулевое количество убирает предмет из наличия.</p></form></Modal>}
  {draft && <Modal title="Редактор сайта" close={() => { if (!busy && (JSON.stringify(draft) === JSON.stringify(content) || confirm('Отменить несохранённые изменения?'))) setDraft(null) }}><form onSubmit={saveContent}><ContentEditor draft={draft} setDraft={setDraft}/>{(['title', 'description', 'about', 'report', 'author'] as const).map((key, i) => <label key={key}>{['Заголовок', 'Подзаголовок', 'О гильдии', 'Последний рапорт', 'Подпись рапорта'][i]}<textarea required maxLength={key === 'about' ? 6000 : 2000} rows={key === 'about' ? 5 : 2} value={draft[key]} onChange={e => setDraft({ ...draft, [key]: e.target.value })}/></label>)}{draft.rules.map((r, i) => <label key={i}>Правило {i + 1}<input required maxLength={120} value={r} onChange={e => setDraft({ ...draft, rules: draft.rules.map((x, j) => i === j ? e.target.value : x) })}/></label>)}<details className="preview"><summary>Предпросмотр текста</summary><h3>{draft.copy['ПЕПЕЛЬНЫЙ ЩИТ']}</h3><h3>{draft.title}</h3><p>{draft.description}</p><p>{draft.about}</p><blockquote>{draft.report}</blockquote></details>{inputError && <p className="form-error" role="alert">{inputError}</p>}<button className="primary" disabled={busy}>{busy ? 'Сохраняем…' : 'Сохранить изменения'}<Check size={16}/></button></form></Modal>}
  {toast && <div className="toast" role="status"><Check size={18}/>{toast}</div>}</>)
}
