import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import ShortageDialog from '../components/dialogs/ShortageDialog'
import UnknownBarcodeDialog from '../components/dialogs/UnknownBarcodeDialog'
import WrongSkuDialog from '../components/dialogs/WrongSkuDialog'

const STATUS_COLOR = {
  pending: 'bg-gray-200',
  in_progress: 'bg-blue-500',
  complete: 'bg-green-500',
  partial: 'bg-orange-400',
  out_of_stock: 'bg-red-500',
}

const STATUS_LABEL = {
  pending: 'Pendente',
  in_progress: 'Separando...',
  complete: '✓ Completo',
  partial: '⚠ Parcial',
  out_of_stock: '✗ Sem estoque',
}

export default function Picking() {
  const { sessionId } = useParams()
  const [searchParams] = useSearchParams()
  const focusSku = searchParams.get('sku')
  const navigate = useNavigate()
  const operator = JSON.parse(sessionStorage.getItem('operator') || 'null')

  // Navigate back to the items list (used when focusSku mode is active)
  const goBackToItems = useCallback(
    () => navigate(`/sessions/${sessionId}/items`),
    [sessionId, navigate]
  )

  const [session, setSession] = useState(null)
  const [item, setItem] = useState(null)
  const [recentItems, setRecentItems] = useState([])
  const [barcode, setBarcode] = useState('')
  const [flash, setFlash] = useState(null) // 'ok' | 'error' | 'complete'
  const [dialog, setDialog] = useState(null) // { type, data }
  const [printers, setPrinters] = useState([])
  const [selectedPrinter, setSelectedPrinter] = useState(null)
  const [printStatus, setPrintStatus] = useState(null)
  const [loading, setLoading] = useState(true)
  const [allItems, setAllItems] = useState([])
  const [scanMode, setScanMode] = useState('unit') // 'unit' | 'box'

  const inputRef = useRef()

  const focusInput = useCallback(() => {
    setTimeout(() => inputRef.current?.focus(), 80)
  }, [])

  // Load session on mount
  useEffect(() => {
    if (!operator) { navigate('/'); return }
    Promise.all([
      api.getSession(sessionId),
      api.getPrinters(),
    ]).then(([s, p]) => {
      setSession(s)
      setPrinters(p)
      if (p.length > 0) setSelectedPrinter(p[0].id)
      if (focusSku) {
        // Focused mode: load items list and show the specific SKU
        api.getItems(sessionId).then(items => {
          const focused = items.find(i => i.sku === focusSku)
          setItem(focused || null)
          if (!focused) api.getItems(sessionId).then(setAllItems)
        })
      } else {
        setItem(s.current_item)
        if (!s.current_item) api.getItems(sessionId).then(setAllItems)
      }
    }).finally(() => { setLoading(false); focusInput() })
  }, [sessionId, focusSku])

  function refreshSession() {
    api.getSession(sessionId).then(s => {
      setSession(s)
      setItem(s.current_item)
      // When session completes, load full items list for summary
      if (!s.current_item) {
        api.getItems(sessionId).then(setAllItems)
      }
    })
  }

  function triggerFlash(type) {
    setFlash(type)
    setTimeout(() => setFlash(null), 600)
  }

  async function handleScan(e) {
    if (e.key !== 'Enter' || !barcode.trim()) return
    const code = barcode.trim()
    setBarcode('')

    try {
      const res = scanMode === 'box'
        ? await api.scanBox(sessionId, code, operator.id)
        : await api.scan(sessionId, code, operator.id)

      updateFromResponse(res, code)

      // Box mode: auto-print labels when item completes
      if (scanMode === 'box' && res.status === 'complete' && res.item?.labels_ready && selectedPrinter) {
        setPrintStatus('printing')
        api.printLabels(sessionId, res.item.sku, selectedPrinter)
          .then(r => setPrintStatus(r.status === 'ok' ? 'done' : 'error'))
          .catch(() => setPrintStatus('error'))
      }
    } catch (err) {
      triggerFlash('error')
      focusInput()
    }
  }

  function updateFromResponse(res, code) {
    if (res.progress) {
      setSession(prev => prev ? { ...prev, progress: res.progress } : prev)
    }

    switch (res.status) {
      case 'ok':
        setItem(res.item)
        triggerFlash('ok')
        break

      case 'complete':
        setItem(res.item)
        setPrintStatus(null)
        triggerFlash('complete')
        if (focusSku) {
          setTimeout(goBackToItems, 600)
        } else {
          setRecentItems(prev => [res.item, ...prev.slice(0, 4)])
          setTimeout(() => {
            api.getSession(sessionId).then(s => {
              setSession(s)
              setItem(s.current_item)
              if (!s.current_item) api.getItems(sessionId).then(setAllItems)
            })
          }, 400)
        }
        break

      case 'excess':
        triggerFlash('error')
        break

      case 'unknown_barcode':
        setDialog({ type: 'unknown', data: { barcode: code, sku: res.sku } })
        return // don't refocus yet

      case 'wrong_sku':
        setDialog({ type: 'wrong_sku', data: res })
        return
    }

    focusInput()
  }

  async function handleShortageConfirm(qtyFound) {
    setDialog(null)
    const res = await api.shortage(sessionId, item.sku, qtyFound, operator.id)
    setSession(prev => prev ? { ...prev, progress: res.progress } : prev)
    if (focusSku) {
      goBackToItems()
    } else {
      setRecentItems(prev => [res.item, ...prev.slice(0, 4)])
      const s = await api.getSession(sessionId)
      setSession(s)
      setItem(s.current_item)
      if (!s.current_item) api.getItems(sessionId).then(setAllItems)
      focusInput()
    }
  }

  async function handleOutOfStock() {
    // If some units were already scanned, ask for confirmation showing the breakdown
    if (item.qty_picked > 0) {
      setDialog({ type: 'oos_confirm' })
      return
    }
    await _doOutOfStock()
  }

  async function _doOutOfStock() {
    setDialog(null)
    const res = await api.outOfStock(sessionId, item.sku, operator.id)
    setSession(prev => prev ? { ...prev, progress: res.progress } : prev)
    if (focusSku) {
      goBackToItems()
    } else {
      setRecentItems(prev => [res.item, ...prev.slice(0, 4)])
      const s = await api.getSession(sessionId)
      setSession(s)
      setItem(s.current_item)
      if (!s.current_item) api.getItems(sessionId).then(setAllItems)
      focusInput()
    }
  }

  async function handleUndo() {
    const res = await api.undo(sessionId, item.sku, operator.id)
    setItem(res.item)
    setSession(prev => prev ? { ...prev, progress: res.progress } : prev)
    focusInput()
  }

  async function handleReopen(sku) {
    const res = await api.reopen(sessionId, sku, operator.id)
    setRecentItems(prev => prev.map(i => i.sku === sku ? res.item : i))
    refreshSession()
    focusInput()
  }

  async function handleAddBarcode(code) {
    setDialog(null)
    if (item) {
      await api.addBarcode(sessionId, code, item.sku, operator.id)
      // Retry the scan
      const res = await api.scan(sessionId, code, operator.id)
      updateFromResponse(res, code)
    }
    focusInput()
  }

  async function handlePrint() {
    if (!selectedPrinter) return
    setPrintStatus('printing')
    try {
      const res = await api.printLabels(sessionId, item.sku, selectedPrinter)
      setPrintStatus(res.status === 'ok' ? 'done' : 'error')
    } catch {
      setPrintStatus('error')
    }
    focusInput()
  }

  if (loading) return <div className="flex items-center justify-center min-h-screen text-3xl text-gray-400">Carregando...</div>

  const progress = session?.progress || {}
  const pct = progress.items_total ? Math.round((progress.items_picked / progress.items_total) * 100) : 0

  return (
    <div className={`min-h-screen flex flex-col transition-colors duration-300 ${
      flash === 'ok' ? 'bg-green-50' : flash === 'error' ? 'bg-red-50' : flash === 'complete' ? 'bg-green-100' : 'bg-gray-100'
    }`}>

      {/* Header */}
      <div className="bg-white shadow px-6 py-4 flex flex-col gap-2">
        <div className="flex justify-between items-center">
          <div className="flex gap-6 items-baseline">
            <span className="text-2xl font-bold">{operator?.name}</span>
            <span className="text-xl text-gray-500">{session?.session_code}</span>
          </div>
          <button
            onClick={() => focusSku ? goBackToItems() : navigate('/sessions')}
            className="text-gray-400 hover:text-gray-700"
          >
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

      <div className="flex-1 p-6 max-w-2xl mx-auto w-full flex flex-col gap-6">

        {/* Scan input — hidden when session is complete */}
        {item && (
          <div className="bg-white rounded-2xl shadow p-6">

            {/* Scan mode selector */}
            <div className="mb-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Modo de bipagem</p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => { setScanMode('unit'); focusInput() }}
                  className={`py-3 px-4 rounded-xl text-sm font-bold border-2 transition-all ${
                    scanMode === 'unit'
                      ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-blue-300'
                  }`}
                >
                  <span className="block text-lg leading-none mb-1">1</span>
                  Unitário (1 a 1)
                </button>
                <button
                  onClick={() => { setScanMode('box'); focusInput() }}
                  className={`py-3 px-4 rounded-xl text-sm font-bold border-2 transition-all ${
                    scanMode === 'box'
                      ? 'bg-orange-500 text-white border-orange-500 shadow-sm'
                      : 'bg-white text-gray-500 border-gray-200 hover:border-orange-300'
                  }`}
                >
                  <span className="block text-lg leading-none mb-1">📦</span>
                  Caixa / Total
                </button>
              </div>
              {scanMode === 'box' && (
                <div className="mt-2 flex items-center gap-2 bg-orange-50 border border-orange-300 rounded-xl px-3 py-2">
                  <span className="text-orange-500 text-lg">⚡</span>
                  <p className="text-orange-700 text-xs font-semibold">
                    1 leitura = {item.qty_required} unidades — item será concluído automaticamente
                  </p>
                </div>
              )}
            </div>

            <p className="text-center text-gray-400 text-lg mb-3 uppercase tracking-wide">Escaneie o código de barras</p>
            <input
              ref={inputRef}
              className="scan-input"
              placeholder="▐ _ ▌"
              value={barcode}
              onChange={e => setBarcode(e.target.value)}
              onKeyDown={handleScan}
              autoFocus
            />
          </div>
        )}

        {/* Current item */}
        {item ? (
          <div className="bg-white rounded-2xl shadow p-6 flex flex-col gap-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-gray-400 text-sm uppercase tracking-wide">SKU</p>
                <p className="text-2xl font-mono font-bold">{item.sku}</p>
                <p className="text-xl text-gray-600 mt-1">{item.description}</p>
              </div>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${STATUS_COLOR[item.status]} text-white`}>
                {STATUS_LABEL[item.status]}
              </span>
            </div>

            {/* Progress bar */}
            <div>
              <div className="flex justify-between text-xl font-bold mb-1">
                <span>{item.qty_picked} separados</span>
                <span className="text-gray-400">de {item.qty_required}</span>
              </div>
              <div className="h-6 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${STATUS_COLOR[item.status]}`}
                  style={{ width: `${Math.min((item.qty_picked / item.qty_required) * 100, 100)}%` }}
                />
              </div>
            </div>

            {/* Action buttons */}
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={handleUndo}
                disabled={item.qty_picked === 0}
                className="py-4 rounded-xl border-2 border-gray-300 text-lg font-medium hover:bg-gray-100 disabled:opacity-30"
              >
                -1 LEITURA
              </button>
              <button
                onClick={() => setDialog({ type: 'shortage' })}
                className="py-4 rounded-xl border-2 border-orange-400 text-orange-600 text-lg font-medium hover:bg-orange-50"
              >
                FALTA
              </button>
              <button
                onClick={handleOutOfStock}
                className="py-4 rounded-xl border-2 border-red-400 text-red-600 text-lg font-medium hover:bg-red-50"
              >
                SEM ESTOQUE
              </button>
            </div>

            {/* Print button */}
            {item.labels_ready && (
              <div className="border-t pt-4">
                <div className="flex gap-3 items-center">
                  <select
                    value={selectedPrinter || ''}
                    onChange={e => setSelectedPrinter(Number(e.target.value))}
                    className="flex-1 border-2 border-gray-300 rounded-xl p-3 text-lg"
                  >
                    {printers.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <button
                    onClick={handlePrint}
                    disabled={!selectedPrinter || printStatus === 'printing'}
                    className="flex-1 py-4 rounded-xl bg-green-600 text-white text-xl font-bold hover:bg-green-700 disabled:opacity-50"
                  >
                    {printStatus === 'printing' ? 'Imprimindo...' :
                     printStatus === 'done' ? '✓ Impresso!' :
                     printStatus === 'error' ? '✗ Erro — Tentar novamente' :
                     `IMPRIMIR ${item.qty_required} ETIQUETAS`}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <CompletionSummary items={allItems} onBack={() => navigate('/sessions')} />
        )}

        {/* Recently completed — hide when session is done (full summary is shown instead) */}
        {item && recentItems.length > 0 && (
          <div>
            <p className="text-gray-400 uppercase tracking-wide text-sm mb-2">Concluídos recentemente</p>
            <div className="flex flex-col gap-2">
              {recentItems.map(ri => (
                <div key={ri.sku} className="bg-white rounded-xl px-4 py-3 flex justify-between items-center shadow-sm">
                  <div>
                    <span className={`inline-block w-2 h-2 rounded-full mr-2 ${STATUS_COLOR[ri.status]}`} />
                    <span className="font-mono font-medium">{ri.sku}</span>
                    <span className="text-gray-400 ml-3">✓ {ri.qty_picked}</span>
                    {ri.shortage_qty > 0 && (
                      <span className="text-red-400 ml-2">/ {ri.shortage_qty} sem estoque</span>
                    )}
                  </div>
                  <button
                    onClick={() => handleReopen(ri.sku)}
                    className="text-blue-500 hover:underline text-sm"
                  >
                    reabrir
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Dialogs */}
      {dialog?.type === 'oos_confirm' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-6">
          <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full flex flex-col gap-6">
            <h2 className="text-2xl font-bold text-center">Confirmar Sem Estoque</h2>
            <div className="bg-gray-50 rounded-xl p-4 text-center">
              <p className="text-lg text-green-700 font-semibold">✓ {item.qty_picked} lidos serão mantidos</p>
              <p className="text-lg text-red-600 font-semibold mt-1">
                ✗ {item.qty_required - item.qty_picked} marcados como sem estoque
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => { setDialog(null); focusInput() }}
                className="py-4 rounded-xl border-2 border-gray-300 text-lg font-medium hover:bg-gray-100"
              >
                CANCELAR
              </button>
              <button
                onClick={_doOutOfStock}
                className="py-4 rounded-xl bg-red-500 text-white text-lg font-bold hover:bg-red-600"
              >
                CONFIRMAR
              </button>
            </div>
          </div>
        </div>
      )}

      {dialog?.type === 'shortage' && (
        <ShortageDialog
          item={item}
          onConfirm={handleShortageConfirm}
          onCancel={() => { setDialog(null); focusInput() }}
        />
      )}
      {dialog?.type === 'unknown' && (
        <UnknownBarcodeDialog
          barcode={dialog.data.barcode}
          currentSku={item?.sku}
          onAdd={() => handleAddBarcode(dialog.data.barcode)}
          onSkip={() => { setDialog(null); focusInput() }}
        />
      )}
      {dialog?.type === 'wrong_sku' && (
        <WrongSkuDialog
          scannedItem={dialog.data.item}
          expectedSku={dialog.data.expected_sku}
          onConfirm={async () => {
            setDialog(null)
            const res = await api.reopen(sessionId, dialog.data.scanned_sku, operator.id)
            setItem(res.item)
            focusInput()
          }}
          onCancel={() => { setDialog(null); focusInput() }}
        />
      )}
    </div>
  )
}

function CompletionSummary({ items, onBack }) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-6 items-center justify-center py-16">
        <p className="text-2xl text-gray-400">Carregando resumo...</p>
      </div>
    )
  }

  const complete   = items.filter(i => i.status === 'complete')
  const partial    = items.filter(i => i.status === 'partial')
  const outOfStock = items.filter(i => i.status === 'out_of_stock')
  const totalPicked = items.reduce((s, i) => s + i.qty_picked, 0)
  const totalShort  = items.reduce((s, i) => s + (i.shortage_qty || 0), 0)
  const pendentes   = [...partial, ...outOfStock]

  return (
    <div className="flex flex-col gap-6">

      {/* Banner principal */}
      <div className="bg-green-100 border-2 border-green-400 rounded-2xl p-8 text-center">
        <p className="text-4xl font-bold text-green-700 mb-3">🎉 Lista concluída!</p>
        <div className="flex justify-center gap-8 text-xl">
          <div>
            <p className="font-bold text-green-700 text-3xl">{totalPicked}</p>
            <p className="text-green-600 text-sm">unidades separadas</p>
          </div>
          {totalShort > 0 && (
            <div>
              <p className="font-bold text-orange-600 text-3xl">{totalShort}</p>
              <p className="text-orange-500 text-sm">sem estoque / falta</p>
            </div>
          )}
        </div>
      </div>

      {/* Cards de contagem por status */}
      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="bg-green-50 border-2 border-green-300 rounded-xl p-4">
          <p className="text-3xl font-bold text-green-700">{complete.length}</p>
          <p className="text-sm text-green-600 mt-1">✓ Completos</p>
        </div>
        <div className="bg-orange-50 border-2 border-orange-300 rounded-xl p-4">
          <p className="text-3xl font-bold text-orange-600">{partial.length}</p>
          <p className="text-sm text-orange-500 mt-1">⚠ Parciais</p>
        </div>
        <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4">
          <p className="text-3xl font-bold text-red-600">{outOfStock.length}</p>
          <p className="text-sm text-red-500 mt-1">✗ Sem estoque</p>
        </div>
      </div>

      {/* Detalhes dos itens com pendência */}
      {pendentes.length > 0 && (
        <div className="bg-white rounded-2xl shadow p-4">
          <p className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Itens com pendência ({pendentes.length})
          </p>
          <div className="flex flex-col divide-y max-h-64 overflow-y-auto">
            {pendentes.map(i => (
              <div key={i.sku} className="flex justify-between items-center py-3">
                <div>
                  <span className="font-mono font-semibold text-sm">{i.sku}</span>
                  {i.description && (
                    <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[200px]">{i.description}</p>
                  )}
                </div>
                <div className="text-right text-sm whitespace-nowrap ml-4">
                  <span className="text-green-700 font-medium">✓ {i.qty_picked} lidos</span>
                  {i.shortage_qty > 0 && (
                    <span className="text-red-500 font-medium ml-3">✗ {i.shortage_qty} sem estoque</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={onBack}
        className="w-full py-5 bg-blue-600 text-white text-2xl font-bold rounded-2xl hover:bg-blue-700"
      >
        VOLTAR PARA AS LISTAS
      </button>
    </div>
  )
}
