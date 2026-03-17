import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'

// ── Icons ─────────────────────────────────────────────────────────────────────
function TrashIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  )
}

const STATUS_LABEL = { open: 'Disponível', in_progress: 'Em andamento', completed: 'Concluída' }

// ── Tab Button ─────────────────────────────────────────────────────────────────
function TabBtn({ id, active, onClick, children }) {
  return (
    <button
      id={id}
      onClick={onClick}
      className={`px-6 py-3 text-sm font-semibold transition-all border-b-2 whitespace-nowrap ${
        active
          ? 'border-blue-600 text-blue-600'
          : 'border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300'
      }`}
    >
      {children}
    </button>
  )
}

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KpiCard({ value, label, color, icon }) {
  const colors = {
    blue:  'bg-blue-50  border-blue-200  text-blue-700',
    green: 'bg-green-50 border-green-200 text-green-700',
    gray:  'bg-gray-50  border-gray-200  text-gray-600',
  }
  return (
    <div className={`rounded-2xl border-2 p-5 flex flex-col gap-1 ${colors[color]}`}>
      <span className="text-3xl">{icon}</span>
      <p className="text-4xl font-black mt-1">{value}</p>
      <p className="text-sm font-semibold uppercase tracking-wider opacity-70">{label}</p>
    </div>
  )
}

// ── Progress Hero ─────────────────────────────────────────────────────────────
function ProgressHero({ sessions }) {
  const totalPicked = sessions.reduce((s, r) => s + (r.items_picked || 0), 0)
  const totalItems  = sessions.reduce((s, r) => s + (r.items_total  || 0), 0)
  const done        = sessions.filter(s => s.status === 'completed').length
  const pct         = totalItems ? Math.round((totalPicked / totalItems) * 100) : 0

  const active    = sessions.filter(s => s.status === 'in_progress').length
  const available = sessions.filter(s => s.status === 'open').length

  // gradient color based on progress
  const barColor = pct >= 90
    ? 'from-green-500 to-emerald-400'
    : pct >= 50
    ? 'from-blue-500 to-sky-400'
    : 'from-orange-500 to-amber-400'

  if (sessions.length === 0) {
    return (
      <div className="bg-white rounded-2xl border-2 border-dashed border-gray-200 p-10 text-center text-gray-400">
        <p className="text-5xl mb-3">📦</p>
        <p className="text-lg font-semibold">Nenhuma lista carregada ainda</p>
        <p className="text-sm mt-1">Vá para a aba <strong>Ferramentas</strong> e carregue o PDF de picking.</p>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
      {/* Header */}
      <div className="flex justify-between items-start mb-6">
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Progresso Total do Envio</p>
          <div className="flex items-baseline gap-4">
            <span className="text-5xl font-black text-gray-900">{pct}%</span>
            <span className="text-xl text-gray-400 font-medium">
              {totalPicked.toLocaleString('pt-BR')} / {totalItems.toLocaleString('pt-BR')} unidades
            </span>
          </div>
        </div>
        <div className="text-right text-sm text-gray-500">
          <p><span className="font-bold text-green-600">{done}</span> / {sessions.length} listas concluídas</p>
        </div>
      </div>

      {/* Bar */}
      <div className="w-full h-5 bg-gray-100 rounded-full overflow-hidden shadow-inner">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${barColor} transition-all duration-1000 ease-out`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-4 mt-6">
        <KpiCard value={active}    label="Em Andamento" color="blue"  icon="🔵" />
        <KpiCard value={available} label="Disponíveis"  color="gray"  icon="⚪" />
        <KpiCard value={done}      label="Concluídas"   color="green" icon="✅" />
      </div>
    </div>
  )
}

// ── Ranking ───────────────────────────────────────────────────────────────────
function OperatorRanking() {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getOperatorRanking()
      .then(res => { if (Array.isArray(res)) setData(res); setLoading(false) })
      .catch(() => setLoading(false))
  }, [])

  if (loading) return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 animate-pulse">
      <div className="h-4 w-40 bg-gray-200 rounded mb-6" />
      {[1, 2, 3].map(i => <div key={i} className="h-8 bg-gray-100 rounded-full mb-3" />)}
    </div>
  )

  const maxValue = data.length > 0 ? Math.max(...data.map(d => d.total || 0), 1) : 1
  const medals = ['🥇', '🥈', '🥉']
  const barColors = [
    'from-yellow-400 to-amber-500',
    'from-gray-300 to-gray-400',
    'from-orange-300 to-orange-500',
  ]

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-gray-800">🏆 Ranking de Produtividade</h3>
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">Itens Separados</span>
      </div>

      {data.length === 0 ? (
        <div className="text-center py-8 text-gray-400 italic text-sm">
          Nenhum dado ainda.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {data.slice(0, 8).map((op, idx) => (
            <div key={op.name} className="flex items-center gap-3">
              <span className="text-xl w-7 text-center">{medals[idx] || `${idx + 1}`}</span>
              <div className="flex-1">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-sm font-bold text-gray-800">{op.name}</span>
                  <span className="text-xs font-mono font-bold text-gray-500">
                    {(op.total || 0).toLocaleString('pt-BR')} itens
                  </span>
                </div>
                <div className="h-3 w-full bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${barColors[idx] || 'from-blue-400 to-blue-500'} transition-all duration-1000`}
                    style={{ width: `${((op.total || 0) / maxValue) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Tool Card (Ferramentas Tab) ───────────────────────────────────────────────
function ToolCard({ icon, title, description, children, accentColor = 'blue' }) {
  const accents = {
    blue:   'border-blue-100   bg-blue-50/50',
    green:  'border-green-100  bg-green-50/50',
    red:    'border-red-100    bg-red-50/50',
    indigo: 'border-indigo-100 bg-indigo-50/30',
  }
  return (
    <div className={`rounded-2xl border-2 p-6 ${accents[accentColor]}`}>
      <div className="flex items-center gap-3 mb-2">
        <span className="text-3xl">{icon}</span>
        <h3 className="text-xl font-bold text-gray-800">{title}</h3>
      </div>
      <p className="text-sm text-gray-500 mb-5">{description}</p>
      {children}
    </div>
  )
}

// ── Session Row (unchanged logic) ─────────────────────────────────────────────
function SessionRow({ s, onDeleted }) {
  const [confirm, setConfirm] = useState(false)
  const [confirmReopen, setConfirmReopen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [reopening, setReopening] = useState(false)
  const [details, setDetails] = useState(false)
  const [items, setItems] = useState([])
  const [loadingItems, setLoadingItems] = useState(false)
  const [errMsg, setErrMsg] = useState(null)
  const pct = s.items_total ? Math.round((s.items_picked / s.items_total) * 100) : 0

  async function doReopen() {
    setReopening(true); setConfirmReopen(false)
    try { await api.reopenSession(s.id); onDeleted() }
    catch (err) { setErrMsg(err.message); setTimeout(() => setErrMsg(null), 3000) }
    finally { setReopening(false) }
  }

  async function toggleDetails() {
    if (details) { setDetails(false); return }
    setLoadingItems(true); setDetails(true)
    try { const data = await api.getItems(s.id); setItems(data) }
    catch (err) { setErrMsg(err.message) }
    finally { setLoadingItems(false) }
  }

  async function handleTransfer(itemId) {
    if (!window.confirm('Transferir este item para uma lista disponível?')) return
    try { await api.transferItem(itemId, 0); toggleDetails(); onDeleted() }
    catch (err) { alert(err.message) }
  }

  async function handleDelete() {
    if (s.status === 'in_progress') {
      setErrMsg('Não é possível excluir uma lista em andamento.')
      setTimeout(() => setErrMsg(null), 3000); return
    }
    setConfirm(true)
  }

  async function confirmDelete() {
    setDeleting(true)
    try { await api.deleteSession(s.id); onDeleted() }
    catch (err) { setErrMsg(err.message); setTimeout(() => setErrMsg(null), 3000); setConfirm(false) }
    finally { setDeleting(false) }
  }

  return (
    <div className="border-b last:border-0">
      <div className="flex items-center gap-4 py-3">
        <span className="font-mono font-semibold w-48 truncate text-sm">{s.session_code}</span>
        <span className="text-gray-500 w-28 text-sm truncate">{s.operator_name || '—'}</span>
        <div className="flex-1 flex items-center gap-2">
          <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-sm text-gray-600 whitespace-nowrap">{s.items_picked}/{s.items_total}</span>
        </div>
        <button onClick={toggleDetails} className="text-sm text-blue-500 hover:underline px-2">
          {details ? 'Ocultar' : 'Ver SKUs'}
        </button>
        {(s.status === 'completed' || s.status === 'in_progress') && !confirmReopen ? (
          <button
            onClick={() => setConfirmReopen(true)} disabled={reopening}
            className={`text-sm font-medium w-28 text-right disabled:opacity-50 hover:underline ${
              s.status === 'completed' ? 'text-green-600 hover:text-blue-600' : 'text-blue-600 hover:text-orange-500'
            }`}
          >
            {reopening ? 'Aguarde...' : s.status === 'completed' ? '✓ Concluída' : 'Em andamento'}
          </button>
        ) : s.status === 'open' ? (
          <span className="text-sm font-medium w-28 text-right text-gray-500">Disponível</span>
        ) : null}

        {confirmReopen && (
          <div className="flex items-center gap-1 w-28 justify-end">
            <button onClick={() => setConfirmReopen(false)} className="px-2 py-1 text-xs rounded border border-gray-300 hover:bg-gray-100">Não</button>
            <button onClick={doReopen} disabled={reopening} className="px-2 py-1 text-xs rounded bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50">Sim</button>
          </div>
        )}
        {!confirm ? (
          <button onClick={handleDelete} title="Excluir lista"
            className={`p-1.5 rounded-lg transition-colors ${s.status === 'in_progress' ? 'text-gray-300 cursor-not-allowed' : 'text-gray-400 hover:text-red-500 hover:bg-red-50'}`}>
            <TrashIcon />
          </button>
        ) : (
          <div className="flex items-center gap-1">
            <button onClick={() => setConfirm(false)} className="px-2 py-1 text-xs rounded border border-gray-300 hover:bg-gray-100">Não</button>
            <button onClick={confirmDelete} disabled={deleting} className="px-2 py-1 text-xs rounded bg-red-500 text-white hover:bg-red-600 disabled:opacity-50">{deleting ? '...' : 'Sim'}</button>
          </div>
        )}
      </div>
      {confirmReopen && <p className="text-xs text-orange-500 pb-2 pl-1">Reinicializar esta lista? O operador perderá o acesso.</p>}
      {confirm && !deleting && <p className="text-xs text-red-500 pb-2 pl-1">Excluir esta lista? Esta ação não pode ser desfeita.</p>}
      {errMsg && <p className="text-xs text-red-500 pb-2 pl-1">{errMsg}</p>}

      {details && (
        <div className="bg-gray-50 m-2 rounded-xl p-4 border-2 border-gray-100">
          {loadingItems ? (
            <p className="text-center text-gray-400">Carregando itens...</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-400 text-left border-b border-gray-200">
                  <th className="pb-2 font-medium">SKU</th>
                  <th className="pb-2 font-medium">Qtd</th>
                  <th className="pb-2 font-medium w-1/4">Obs</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-100/50 transition-colors">
                    <td className="py-2 font-mono">{item.sku}</td>
                    <td className="py-2">{item.qty_picked}/{item.qty_required}</td>
                    <td className="py-2">
                      <div
                        onClick={async (e) => {
                          e.stopPropagation()
                          const newNotes = window.prompt(`Observação para ${item.sku}:`, item.notes || '')
                          if (newNotes === null) return
                          try {
                            await api.updateItemNotes(item.id, newNotes.trim() || null)
                            setItems(prev => prev.map(i => i.id === item.id ? { ...i, notes: newNotes.trim() || null } : i))
                          } catch (e) { alert('Erro: ' + e.message) }
                        }}
                        className="truncate max-w-[220px] cursor-pointer text-blue-600 hover:text-blue-800 italic hover:bg-blue-50 p-1 rounded transition-colors group"
                        title={item.notes || 'Clique para adicionar'}
                      >
                        <span className="mr-1 opacity-0 group-hover:opacity-100 transition-opacity">✏️</span>
                        {item.notes || <span className="text-gray-300">clique para add</span>}
                      </div>
                    </td>
                    <td className="py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        item.status === 'complete' ? 'bg-green-100 text-green-700' :
                        item.status === 'pending'  ? 'bg-gray-200 text-gray-600' :
                        'bg-blue-100 text-blue-700'
                      }`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="py-2 text-right">
                      {item.qty_picked === 0 && (
                        <button onClick={() => handleTransfer(item.id)} className="text-xs font-bold text-orange-600 hover:text-orange-800">
                          TRANSFERIR
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function Supervisor() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('overview')
  const [sessions, setSessions] = useState([])
  const [printers, setPrinters] = useState([])
  const [form, setForm] = useState({ session_code: '' })
  const [files, setFiles] = useState({ pdf: null, txt: null })
  const [uploading, setUploading] = useState(false)
  const [uploadResult, setUploadResult] = useState(null)
  const [newPrinter, setNewPrinter] = useState({ name: '', ip_address: '', port: 9100 })
  const [excelFile, setExcelFile] = useState(null)
  const [excelResult, setExcelResult] = useState(null)
  const [importingExcel, setImportingExcel] = useState(false)
  const [agentInfo, setAgentInfo] = useState(null)
  const [lastRefresh, setLastRefresh] = useState(null)
  const agentCheckRef = useRef(false)
  const refreshIntervalRef = useRef(null)

  useEffect(() => {
    refresh()
    if (!agentCheckRef.current) { agentCheckRef.current = true; checkAgent() }
    // Auto-refresh every 60s
    refreshIntervalRef.current = setInterval(refresh, 60_000)
    return () => clearInterval(refreshIntervalRef.current)
  }, [])

  function checkAgent() {
    setAgentInfo(null)
    fetch('http://localhost:6543/status', { signal: AbortSignal.timeout(2000) })
      .then(r => r.json())
      .then(d => setAgentInfo({ ok: d.status === 'ok', printer: d.printer, allPrinters: d.all_printers || [] }))
      .catch(() => setAgentInfo({ ok: false, printer: null, allPrinters: [] }))
  }

  function refresh() {
    Promise.all([api.getSessions(), api.getPrinters()]).then(([s, p]) => {
      setSessions(s); setPrinters(p)
      setLastRefresh(new Date())
    })
  }

  async function handleUpload(e) {
    e.preventDefault()
    if (!files.pdf) return alert('Selecione o PDF da lista de picking')
    setUploading(true); setUploadResult(null)
    try {
      const fd = new FormData()
      fd.append('session_code', form.session_code)
      fd.append('picking_pdf', files.pdf)
      if (files.txt) fd.append('labels_txt', files.txt)
      const res = await api.uploadSession(fd)
      setUploadResult({ ok: true, msg: `✔ ${res.lists_created} lista(s) criada(s) com ${res.total_items} SKUs no total` })
      setForm({ session_code: '' }); setFiles({ pdf: null, txt: null })
      refresh()
    } catch (err) { setUploadResult({ ok: false, msg: err.message }) }
    finally { setUploading(false) }
  }

  async function handleAddPrinter(e) {
    e.preventDefault()
    await api.createPrinter(newPrinter.name, newPrinter.ip_address, Number(newPrinter.port))
    setNewPrinter({ name: '', ip_address: '', port: 9100 }); refresh()
  }

  async function handleImportExcel(e) {
    e.preventDefault()
    if (!excelFile) return
    setImportingExcel(true); setExcelResult(null)
    try {
      const fd = new FormData(); fd.append('file', excelFile)
      const res = await api.importBarcodesExcel(fd)
      setExcelResult({ ok: true, msg: `✔ ${res.added} EANs importados (${res.deleted ?? 0} anteriores removidos)` })
    } catch (err) { setExcelResult({ ok: false, msg: err.message }) }
    finally { setImportingExcel(false) }
  }

  const available = sessions.filter(s => s.status === 'open')
  const active    = sessions.filter(s => s.status === 'in_progress')
  const done      = sessions.filter(s => s.status === 'completed')

  const timeSince = lastRefresh
    ? `${Math.round((Date.now() - lastRefresh) / 1000)}s atrás`
    : 'atualizando...'

  const TABS = [
    { id: 'overview',  label: '🏠 Visão Geral' },
    { id: 'lists',     label: '📋 Listas' },
    { id: 'tools',     label: '🛠 Ferramentas' },
    { id: 'settings',  label: '⚙️ Config' },
  ]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Top Header ── */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-gray-900 tracking-tight">🏭 NVS Supervisor</h1>
              <span className="text-xs text-gray-400 font-medium bg-gray-100 px-2 py-1 rounded-full">
                ↻ {timeSince}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={refresh}
                className="text-sm text-blue-600 font-semibold hover:text-blue-800 px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors"
              >
                ↻ Atualizar
              </button>
              <a href="/" className="text-sm text-gray-500 hover:text-gray-800 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors">
                ← Operador
              </a>
            </div>
          </div>

          {/* ── Tabs ── */}
          <div className="flex gap-0 -mb-px">
            {TABS.map(t => (
              <TabBtn
                key={t.id}
                id={`tab-${t.id}`}
                active={tab === t.id}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </TabBtn>
            ))}
          </div>
        </div>
      </div>

      {/* ── Tab Content ── */}
      <div className="max-w-6xl mx-auto px-8 py-8">

        {/* ─────────────────── TAB: VISÃO GERAL ─────────────────── */}
        {tab === 'overview' && (
          <div className="flex flex-col gap-6">
            <ProgressHero sessions={sessions} />
            <OperatorRanking />
          </div>
        )}

        {/* ─────────────────── TAB: LISTAS ─────────────────── */}
        {tab === 'lists' && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-800">Monitor de Listas</h2>
              <button onClick={refresh} className="text-sm text-blue-500 hover:underline font-medium">
                ↻ Atualizar
              </button>
            </div>

            {sessions.length === 0 && (
              <p className="text-gray-400 text-center py-12">Nenhuma lista criada ainda.</p>
            )}

            {active.length > 0 && (
              <div className="mb-6">
                <h3 className="text-xs font-bold text-blue-600 uppercase tracking-widest mb-3 flex items-center gap-2">
                  <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse inline-block" />
                  Em Andamento ({active.length})
                </h3>
                {active.map(s => <SessionRow key={s.id} s={s} onDeleted={refresh} />)}
              </div>
            )}

            {available.length > 0 && (
              <div className="mb-6">
                <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">
                  Disponíveis ({available.length})
                </h3>
                {available.map(s => <SessionRow key={s.id} s={s} onDeleted={refresh} />)}
              </div>
            )}

            {done.length > 0 && (
              <div>
                <h3 className="text-xs font-bold text-green-600 uppercase tracking-widest mb-3">
                  Concluídas ({done.length})
                </h3>
                {done.map(s => <SessionRow key={s.id} s={s} onDeleted={refresh} />)}
              </div>
            )}
          </div>
        )}

        {/* ─────────────────── TAB: FERRAMENTAS ─────────────────── */}
        {tab === 'tools' && (
          <div className="grid grid-cols-2 gap-6">

            <ToolCard
              icon="📤"
              title="Carregar Novo Envio"
              description="O sistema divide automaticamente em listas de até 1.000 unidades, ordenadas do maior para o menor."
              accentColor="blue"
            >
              <form onSubmit={handleUpload} className="flex flex-col gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Código do Envio</label>
                  <input
                    className="w-full border-2 border-gray-200 rounded-xl p-3 text-base focus:border-blue-400 outline-none"
                    placeholder="ex: Envio-62040720"
                    value={form.session_code}
                    onChange={e => setForm(f => ({ ...f, session_code: e.target.value }))}
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Lista de Picking (PDF)</label>
                  <input type="file" accept=".pdf" className="w-full border-2 border-gray-200 rounded-xl p-3 text-sm"
                    onChange={e => setFiles(f => ({ ...f, pdf: e.target.files[0] }))} required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Etiquetas (TXT/ZPL) <span className="text-gray-400 font-normal">— opcional</span>
                  </label>
                  <input type="file" accept=".txt,.zpl" className="w-full border-2 border-gray-200 rounded-xl p-3 text-sm"
                    onChange={e => setFiles(f => ({ ...f, txt: e.target.files[0] || null }))} />
                </div>
                <button type="submit" disabled={uploading}
                  className="py-3 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 disabled:opacity-50 transition-colors">
                  {uploading ? 'Processando...' : 'CRIAR LISTAS DE PICKING'}
                </button>
                {uploadResult && (
                  <p className={`text-center text-sm font-medium ${uploadResult.ok ? 'text-green-600' : 'text-red-600'}`}>
                    {uploadResult.msg}
                  </p>
                )}
              </form>
            </ToolCard>

            <ToolCard
              icon="📊"
              title="Importar Códigos de Barras"
              description="Importa EAN → SKU do Excel (ML_FULL_SKU_DESCRICAO.xlsx). Faça isso antes de criar as listas."
              accentColor="green"
            >
              <form onSubmit={handleImportExcel} className="flex flex-col gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Arquivo Excel (.xlsx)</label>
                  <input type="file" accept=".xlsx"
                    className="w-full border-2 border-gray-200 rounded-xl p-3 text-sm"
                    onChange={e => setExcelFile(e.target.files[0])} required />
                </div>
                <button type="submit" disabled={importingExcel || !excelFile}
                  className="py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 disabled:opacity-50 transition-colors">
                  {importingExcel ? 'Importando...' : 'IMPORTAR EANS'}
                </button>
                {excelResult && (
                  <p className={`text-center text-sm font-medium ${excelResult.ok ? 'text-green-600' : 'text-red-600'}`}>
                    {excelResult.msg}
                  </p>
                )}
              </form>
            </ToolCard>

            <ToolCard
              icon="🔍"
              title="Consultar Produtos"
              description="Visualize e pesquise todos os SKUs e EANs cadastrados. Útil para conferência antes da operação."
              accentColor="indigo"
            >
              <button
                onClick={() => navigate('/master-data')}
                className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-colors"
              >
                Abrir Master Data →
              </button>
            </ToolCard>

            <ToolCard
              icon="⚠️"
              title="Relatório de Faltas"
              description="SKUs com falta de estoque consolidados de todas as listas processadas."
              accentColor="red"
            >
              <button
                onClick={() => navigate('/shortage-report')}
                className="w-full py-3 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors"
              >
                Ver Relatório →
              </button>
            </ToolCard>

          </div>
        )}

        {/* ─────────────────── TAB: CONFIG ─────────────────── */}
        {tab === 'settings' && (
          <div className="flex flex-col gap-6">

            {/* Agente de impressão */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h2 className="text-lg font-bold text-gray-800 mb-4">🖨 Agente de Impressão Local</h2>
              {agentInfo === null ? (
                <p className="text-gray-400 text-sm">Verificando agente...</p>
              ) : agentInfo.ok ? (
                <div className="flex items-center gap-3">
                  <span className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                  <p className="text-green-700 font-semibold text-sm">Agente online · {agentInfo.printer || 'Impressora ativa'}</p>
                  <button onClick={checkAgent} className="text-xs text-gray-400 hover:underline ml-auto">↻ Reverificar</button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <span className="w-3 h-3 bg-red-500 rounded-full" />
                  <p className="text-red-600 font-semibold text-sm">Agente offline — abra o ZebraAgent-WP.exe na máquina local</p>
                  <button onClick={checkAgent} className="text-xs text-gray-400 hover:underline ml-auto">↻ Reverificar</button>
                </div>
              )}
            </div>

            {/* Impressoras cadastradas */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <h2 className="text-lg font-bold text-gray-800 mb-4">Impressoras Cadastradas</h2>
              {printers.length === 0 ? (
                <p className="text-gray-400 text-sm mb-4">Nenhuma impressora cadastrada.</p>
              ) : (
                <div className="flex flex-col gap-2 mb-6">
                  {printers.map(p => (
                    <div key={p.id} className="flex items-center justify-between py-2 border-b last:border-0">
                      <span className="font-medium text-sm text-gray-800">{p.name}</span>
                      <span className="font-mono text-xs text-gray-500">{p.ip_address}:{p.port}</span>
                    </div>
                  ))}
                </div>
              )}
              <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">Adicionar Impressora</h3>
              <form onSubmit={handleAddPrinter} className="grid grid-cols-3 gap-3">
                <input className="border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:border-blue-400 outline-none"
                  placeholder="Nome" value={newPrinter.name}
                  onChange={e => setNewPrinter(p => ({ ...p, name: e.target.value }))} required />
                <input className="border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:border-blue-400 outline-none"
                  placeholder="IP (ex: 192.168.1.50)" value={newPrinter.ip_address}
                  onChange={e => setNewPrinter(p => ({ ...p, ip_address: e.target.value }))} required />
                <div className="flex gap-2">
                  <input className="flex-1 border-2 border-gray-200 rounded-xl px-3 py-2 text-sm focus:border-blue-400 outline-none"
                    placeholder="Porta" type="number" value={newPrinter.port}
                    onChange={e => setNewPrinter(p => ({ ...p, port: e.target.value }))} required />
                  <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors">
                    +
                  </button>
                </div>
              </form>
            </div>

            {/* Operadores */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-gray-800">👥 Gerenciar Operadores</h2>
                <p className="text-gray-500 text-sm mt-1">Cadastre membros da equipe e redefina PINs de acesso.</p>
              </div>
              <button onClick={() => navigate('/operators')}
                className="py-3 px-6 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors whitespace-nowrap">
                Painel de Acessos →
              </button>
            </div>

          </div>
        )}

      </div>
    </div>
  )
}
