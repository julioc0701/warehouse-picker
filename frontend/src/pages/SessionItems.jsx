import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../api/client'

const STATUS_COLOR = {
  pending: 'text-gray-400',
  in_progress: 'text-blue-600',
  complete: 'text-green-600',
  partial: 'text-orange-500',
  out_of_stock: 'text-red-500',
}

const STATUS_LABEL = {
  pending: 'Pendente',
  in_progress: 'Em separação',
  complete: '✓ Completo',
  partial: '⚠ Parcial',
  out_of_stock: '✗ Sem estoque',
}

// Statuses that can be reset
const RESETTABLE = ['complete', 'partial', 'out_of_stock', 'in_progress']

export default function SessionItems() {
  const { sessionId } = useParams()
  const navigate = useNavigate()
  const operator = JSON.parse(sessionStorage.getItem('operator') || 'null')

  const [session, setSession] = useState(null)
  const [items, setItems] = useState([])
  const [barcode, setBarcode] = useState('')
  const [errMsg, setErrMsg] = useState(null)
  const [loading, setLoading] = useState(true)
  const [confirmResetAll, setConfirmResetAll] = useState(false)
  const [resettingAll, setResettingAll] = useState(false)
  const inputRef = useRef()

  useEffect(() => {
    if (!operator) { navigate('/'); return }
    loadAll()
  }, [sessionId])

  function loadAll() {
    return Promise.all([api.getSession(sessionId), api.getItems(sessionId)])
      .then(([s, its]) => { setSession(s); setItems(its) })
      .finally(() => { setLoading(false); setTimeout(() => inputRef.current?.focus(), 100) })
  }

  function goToPicking(sku) {
    navigate(`/picking/${sessionId}?sku=${encodeURIComponent(sku)}`)
  }

  async function handleScan(e) {
    if (e.key !== 'Enter' || !barcode.trim()) return
    const code = barcode.trim()
    setBarcode('')
    setErrMsg(null)

    const bySkU = items.find(i => i.sku === code)
    if (bySkU) { goToPicking(bySkU.sku); return }

    try {
      const res = await api.resolveBarcode(code)
      // Check all SKUs returned (a barcode can now be linked to multiple SKUs)
      const resolvedSkus = res.skus || [res.sku]
      const found = items.find(i => resolvedSkus.includes(i.sku))

      if (found) { goToPicking(found.sku); return }
      setErrMsg(`SKU(s) "${resolvedSkus.join(', ')}" não encontrado(s) nesta lista`)
    } catch {
      setErrMsg('Código de barras não encontrado')
    }

    setTimeout(() => setErrMsg(null), 3000)
    inputRef.current?.focus()
  }

  async function handleResetAll() {
    setResettingAll(true)
    try {
      await api.resetAllItems(sessionId, operator.id)
      await loadAll()
      setConfirmResetAll(false)
    } catch (err) {
      setErrMsg(err.message)
    } finally {
      setResettingAll(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen text-3xl text-gray-400">
      Carregando...
    </div>
  )

  const progress = session?.progress || {}
  const pct = progress.items_total
    ? Math.round((progress.items_picked / progress.items_total) * 100)
    : 0

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">

      {/* Header */}
      <div className="bg-white shadow px-6 py-4 flex flex-col gap-2">
        <div className="flex justify-between items-center">
          <div className="flex gap-4 items-baseline">
            <span className="text-2xl font-bold">{operator?.name}</span>
            <span className="text-xl text-gray-500">{session?.session_code}</span>
          </div>
          <button onClick={() => navigate('/sessions')} className="text-gray-400 hover:text-gray-700">
            ← Voltar
          </button>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex-1 h-4 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-lg font-medium whitespace-nowrap">
            {progress.items_picked} / {progress.items_total} itens
          </span>
          <span className="text-lg text-gray-500 whitespace-nowrap">
            {progress.skus_complete} / {progress.skus_total} SKUs
          </span>
        </div>
      </div>

      <div className="flex-1 p-6 max-w-4xl mx-auto w-full flex flex-col gap-6">

        {/* Scanner */}
        <div className="bg-white rounded-2xl shadow p-6">
          <p className="text-center text-gray-400 text-lg mb-3 uppercase tracking-wide">
            Bipe um produto para iniciar a separação
          </p>
          <input
            ref={inputRef}
            className="scan-input"
            placeholder="▐ _ ▌"
            value={barcode}
            onChange={e => setBarcode(e.target.value)}
            onKeyDown={handleScan}
            autoFocus
          />
          {errMsg && <p className="text-center text-red-500 mt-3 text-lg">{errMsg}</p>}
        </div>

        {/* Tabela de itens */}
        <div className="bg-white rounded-2xl shadow overflow-hidden">

          {/* Cabeçalho da tabela com botão reinicializar lista */}
          <div className="flex justify-between items-center px-5 py-3 bg-gray-50 border-b">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {items.length} itens
            </span>

            {!confirmResetAll ? (
              <button
                onClick={() => setConfirmResetAll(true)}
                className="text-xs font-semibold text-orange-500 hover:text-orange-700 border border-orange-300 hover:border-orange-500 rounded-lg px-3 py-1.5 transition-colors"
              >
                ↺ Reinicializar lista inteira
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-600 font-medium">Zerar todos os itens?</span>
                <button
                  onClick={() => setConfirmResetAll(false)}
                  className="text-xs border-2 border-gray-300 rounded-lg px-3 py-1.5 font-semibold hover:bg-gray-100"
                >
                  Não
                </button>
                <button
                  onClick={handleResetAll}
                  disabled={resettingAll}
                  className="text-xs bg-orange-500 text-white rounded-lg px-3 py-1.5 font-semibold hover:bg-orange-600 disabled:opacity-60"
                >
                  {resettingAll ? 'Aguarde...' : 'Sim, zerar tudo'}
                </button>
              </div>
            )}
          </div>

          {confirmResetAll && (
            <div className="px-5 py-2 bg-orange-50 border-b border-orange-200">
              <p className="text-xs text-orange-700 font-medium">
                ⚠ Todos os itens voltarão para quantidade zero e status Pendente. Esta ação não pode ser desfeita.
              </p>
            </div>
          )}

          <table className="w-full">
            <thead>
              <tr className="text-gray-500 uppercase text-xs tracking-wide border-b">
                <th className="text-left px-5 py-3">SKU</th>
                <th className="text-left px-5 py-3">Descrição</th>
                <th className="text-right px-5 py-3">Quantidade</th>
                <th className="text-right px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {items.map(i => (
                <ItemRow
                  key={i.sku}
                  item={i}
                  sessionId={sessionId}
                  operator={operator}
                  onNavigate={goToPicking}
                  onReset={loadAll}
                />
              ))}
            </tbody>
          </table>
        </div>

      </div>
    </div>
  )
}

function ItemRow({ item, sessionId, operator, onNavigate, onReset }) {
  const [confirmReset, setConfirmReset] = useState(false)
  const [resetting, setResetting] = useState(false)

  const canReset = RESETTABLE.includes(item.status)

  async function doReset(e) {
    e.stopPropagation()
    setResetting(true)
    try {
      await api.resetItem(sessionId, item.sku, operator.id)
      await onReset()
      setConfirmReset(false)
    } finally {
      setResetting(false)
    }
  }

  async function doForceComplete(e) {
    e.stopPropagation()
    setResetting(true)
    try {
      await api.forceCompleteItem(sessionId, item.sku, operator.id)
      await onReset()
      setConfirmReset(false)
    } finally {
      setResetting(false)
    }
  }

  return (
    <tr
      onClick={() => onNavigate(item.sku)}
      className="border-t border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors"
    >
      <td className="px-5 py-4 font-mono font-bold text-sm">{item.sku}</td>
      <td className="px-5 py-4 text-gray-600 text-sm max-w-xs">
        <span className="line-clamp-2">{item.description || '—'}</span>
      </td>
      <td className="px-5 py-4 text-right font-semibold text-lg">{item.qty_required}</td>

      {/* Status — clicável para reinicializar */}
      <td className="px-5 py-4 text-right" onClick={e => e.stopPropagation()}>
        {!confirmReset ? (
          <button
            onClick={() => setConfirmReset(true)}
            title="Alterar status manualmente"
            className={`font-medium text-sm ${STATUS_COLOR[item.status]} hover:opacity-60 underline decoration-dotted cursor-pointer`}
          >
            {STATUS_LABEL[item.status] || item.status}
          </button>
        ) : (
          <div className="flex items-center justify-end gap-1.5">
            {item.status !== 'pending' && (
              <button
                onClick={doReset}
                disabled={resetting}
                className="text-xs bg-orange-500 text-white rounded-lg px-2 py-1.5 hover:bg-orange-600 disabled:opacity-60 font-medium"
              >
                {resetting ? '...' : 'Zerar'}
              </button>
            )}
            {item.status !== 'complete' && (
              <button
                onClick={doForceComplete}
                disabled={resetting}
                className="text-xs bg-green-600 text-white rounded-lg px-2 py-1.5 hover:bg-green-700 disabled:opacity-60 font-medium"
              >
                {resetting ? '...' : 'Concluir'}
              </button>
            )}
            <button
              onClick={e => { e.stopPropagation(); setConfirmReset(false) }}
              className="text-xs border border-gray-300 rounded-lg px-2 py-1.5 hover:bg-gray-100 font-medium"
            >
              ✗
            </button>
          </div>
        )}
      </td>
    </tr>
  )
}
