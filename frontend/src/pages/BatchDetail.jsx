import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
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

// ── SessionRow (full detail, same as Supervisor) ───────────────────────────────
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
            className="p-1.5 rounded-lg transition-colors text-gray-400 hover:text-red-500 hover:bg-red-50">
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

// ── BatchDetail Page ──────────────────────────────────────────────────────────
export default function BatchDetail() {
  const { batchId } = useParams()
  const navigate = useNavigate()
  const [batch, setBatch] = useState(null)
  const [loading, setLoading] = useState(true)

  function load() {
    api.listBatches()
      .then(all => {
        const found = all.find(b => String(b.id) === String(batchId))
        setBatch(found || null)
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [batchId])

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400 animate-pulse text-lg">Carregando lote...</p>
    </div>
  )

  if (!batch) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <p className="text-6xl mb-4">😕</p>
        <p className="text-xl font-bold text-gray-700">Lote não encontrado</p>
        <button onClick={() => navigate('/supervisor')} className="mt-4 text-blue-500 hover:underline">
          ← Voltar ao Supervisor
        </button>
      </div>
    </div>
  )

  const pct = batch.pct || 0
  const barColor = pct >= 90 ? 'from-green-500 to-emerald-400' : pct >= 50 ? 'from-blue-500 to-sky-400' : 'from-orange-500 to-amber-400'

  const active    = batch.sessions.filter(s => s.status === 'in_progress').length
  const available = batch.sessions.filter(s => s.status === 'open').length
  const done      = batch.sessions.filter(s => s.status === 'completed').length

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 shadow-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-8 py-5 flex items-center gap-4">
          <button
            onClick={() => navigate('/supervisor?tab=lists')}
            className="p-2 rounded-xl hover:bg-gray-100 text-gray-500 transition-colors"
            title="Voltar"
          >
            ←
          </button>
          <div className="flex-1">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Lote</p>
            <h1 className="text-2xl font-black text-gray-900">{batch.name}</h1>
          </div>
          {batch.status === 'active' && (
            <button
              onClick={() => api.archiveBatch(batch.id).then(() => navigate('/supervisor?tab=lists'))}
              className="text-sm text-gray-400 hover:text-red-500 border border-gray-200 hover:border-red-200 px-4 py-2 rounded-xl transition-colors"
            >
              Arquivar Lote
            </button>
          )}
          {batch.status === 'archived' && (
            <span className="text-xs font-semibold bg-gray-100 text-gray-400 px-3 py-1.5 rounded-full">Arquivado</span>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-8 py-8 flex flex-col gap-6">
        {/* Progress card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-8">
          <div className="flex justify-between items-start mb-6">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-1">Progresso do Lote</p>
              <p className="text-6xl font-black text-gray-900">{pct}<span className="text-3xl text-gray-400">%</span></p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-black text-gray-700">
                {batch.total_picked.toLocaleString('pt-BR')}
                <span className="text-lg text-gray-400"> / {batch.total_items.toLocaleString('pt-BR')}</span>
              </p>
              <p className="text-sm text-gray-400 mt-1">itens separados</p>
            </div>
          </div>
          <div className="h-4 bg-gray-100 rounded-full overflow-hidden mb-6">
            <div
              className={`h-full rounded-full bg-gradient-to-r ${barColor} transition-all duration-1000`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            {[
              { v: active,    label: 'Em Andamento', color: 'bg-blue-50 border-blue-200 text-blue-700',   icon: '🔵' },
              { v: available, label: 'Disponíveis',  color: 'bg-gray-50 border-gray-200 text-gray-600',   icon: '⚪' },
              { v: done,      label: 'Concluídas',   color: 'bg-green-50 border-green-200 text-green-700', icon: '✅' },
            ].map(k => (
              <div key={k.label} className={`rounded-2xl border-2 p-4 flex flex-col gap-1 ${k.color}`}>
                <span className="text-2xl">{k.icon}</span>
                <p className="text-3xl font-black mt-1">{k.v}</p>
                <p className="text-xs font-bold uppercase tracking-wider opacity-70">{k.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Sessions list */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 className="font-bold text-gray-800">📋 Listas do Lote</h2>
            <button onClick={load} className="text-sm text-blue-500 hover:underline">↻ Atualizar</button>
          </div>

          {batch.sessions.length === 0 ? (
            <p className="text-center text-gray-400 py-12">Nenhuma lista neste lote.</p>
          ) : (
            <div className="px-6 divide-y divide-gray-50">
              {/* In progress */}
              {batch.sessions.filter(s => s.status === 'in_progress').length > 0 && (
                <div className="py-2">
                  <p className="text-xs font-bold text-blue-600 uppercase tracking-widest flex items-center gap-2 mb-2 mt-2">
                    <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse inline-block" /> Em Andamento
                  </p>
                  {batch.sessions.filter(s => s.status === 'in_progress').map(s => (
                    <SessionRow key={s.id} s={s} onDeleted={load} />
                  ))}
                </div>
              )}
              {/* Open */}
              {batch.sessions.filter(s => s.status === 'open').length > 0 && (
                <div className="py-2">
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2 mt-2">Disponíveis</p>
                  {batch.sessions.filter(s => s.status === 'open').map(s => (
                    <SessionRow key={s.id} s={s} onDeleted={load} />
                  ))}
                </div>
              )}
              {/* Done */}
              {batch.sessions.filter(s => s.status === 'completed').length > 0 && (
                <div className="py-2">
                  <p className="text-xs font-bold text-green-600 uppercase tracking-widest mb-2 mt-2">Concluídas</p>
                  {batch.sessions.filter(s => s.status === 'completed').map(s => (
                    <SessionRow key={s.id} s={s} onDeleted={load} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
