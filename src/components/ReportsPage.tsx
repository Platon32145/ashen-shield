import { useEffect, useState } from 'react'
import { supabase } from '../lib/store'
import type { Report } from '../lib/reports'
export default function ReportsPage({ localReports, signature }: { localReports: Report[]; signature: string }) {
  const [search, setSearch] = useState(''), [rows, setRows] = useState<Report[]>([]), [page, setPage] = useState(0), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!supabase) return
    let alive = true
    const timer = setTimeout(async () => {
      setBusy(true)
      const { data, error } = await supabase!.rpc('search_reports', { p_query: search, p_page: page })
      if (alive) { setRows(data || []); setError(error ? 'Не удалось загрузить отчёты. Выполните миграцию 003_reports.sql и проверьте соединение.' : ''); setBusy(false) }
    }, 180)
    return () => { alive = false; clearTimeout(timer) }
  }, [search, page])
  const reports = supabase ? rows : localReports.filter(r => `${r.body} ${r.author}`.toLowerCase().includes(search.toLowerCase())).slice(page * 50, page * 50 + 50)
  return <section className="wrap reports-page"><span className="eyebrow">АРХИВ ИНТЕНДАНТА</span><h1>Отчёты и рапорты</h1><p className="muted">Ручные записи и автоматическая история движения ресурсов. Время — московское.</p><label className="search"><input aria-label="Поиск рапортов" placeholder="Быстрый поиск по тексту, имени или ресурсу…" value={search} onChange={e => { setSearch(e.target.value); setPage(0) }}/></label>{error && <p role="alert" className="form-error">{error}</p>}{busy && <p className="muted">Поиск в архиве…</p>}<div className="report-list">{reports.map(r => <article className="report" key={r.id}><span className="eyebrow">{r.kind === 'warehouse' ? 'СКЛАДСКОЙ ОТЧЁТ' : 'РАПОРТ'} · {new Date(r.created_at).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })} МСК</span><p>{r.body}</p><span className="report-author">{r.author} — {signature}</span></article>)}</div>{!reports.length && !busy && !error && <p className="muted">Рапорты не найдены.</p>}<div className="pagination"><button className="secondary" disabled={!page} onClick={() => setPage(page - 1)}>Назад</button><span>Страница {page + 1}</span><button className="secondary" disabled={reports.length < 50} onClick={() => setPage(page + 1)}>Далее</button></div></section>
}
