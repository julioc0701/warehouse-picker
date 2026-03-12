import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'

export default function SessionSelect() {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const operator = JSON.parse(sessionStorage.getItem('operator') || 'null')

  const [searchBarcode, setSearchBarcode] = useState('')
  const [searchResult, setSearchResult] = useState(null)  // null | result object
  const [searching, setSearching] = useState(false)
  const searchRef = useRef()
  const dismissTimer = useRef()

  useEffect(() => {
    if (!operator) { navigate('/'); return }
    load()
  }, [])

  // Auto-focus barcode input on mount (scanner-ready)
  useEffect(() => {
    searchRef.current?.focus()
  }, [])

  function load() {
    setLoading(true)
    api.getSessions()
      .then(data => setSessions(data))
      .finally(() => setLoading(false))
  }

  // Listas que este operador já reservou ou está trabalhando
  const mySessions = sessions.filter(
    s => s.operator_id === operator?.id && s.status !== 'completed'
  )

  // Listas disponíveis: abertas sem nenhum operador
  const available = sessions.filter(s =>
    s.status === 'open' && !s.operator_id
  )

  // Listas que este operador já concluiu
  const myDone = sessions.filter(
    s => s.operator_id === operator?.id && s.status === 'completed'
  )

  // Reserva a sessão para este operador ao abrir
  async function openSession(sessionId) {
    try {
      await api.claimSession(sessionId, operator.id)
    } catch {
      // Já reservada (primeiro scan já ocorreu) — tudo bem, só navegar
    }
    navigate(`/sessions/${sessionId}/items`)
  }

  async function handleBarcodeSearch(e) {
    if (e.key !== 'Enter' || !searchBarcode.trim()) return
    const code = searchBarcode.trim()
    setSearchBarcode('')
    setSearching(true)
    setSearchResult(null)
    clearTimeout(dismissTimer.current)

    try {
      const result = await api.findByBarcode(code, operator.id)

      if (result.action === 'open') {
        const { session_id } = result.best_match
        // Navega direto sem claim — a reserva ocorre no primeiro scan
        navigate(`/picking/${session_id}?sku=${encodeURIComponent(result.sku)}`)
        return
      }

      setSearchResult(result)
      // Auto-dismiss after 4 seconds
      dismissTimer.current = setTimeout(() => setSearchResult(null), 4000)
    } catch {
      setSearchResult({ action: 'error' })
      dismissTimer.current = setTimeout(() => setSearchResult(null), 4000)
    } finally {
      setSearching(false)
      searchRef.current?.focus()
    }
  }

  return (
    <div className="min-h-screen p-8 max-w-2xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <p className="text-gray-500 text-lg">Operador</p>
          <h2 className="text-4xl font-bold">{operator?.name}</h2>
        </div>
        <button onClick={() => navigate('/')} className="text-gray-400 hover:text-gray-700 text-lg">
          ← Sair
        </button>
      </div>

      {/* Barcode search */}
      <div className="mb-8">
        <input
          ref={searchRef}
          type="text"
          value={searchBarcode}
          onChange={e => setSearchBarcode(e.target.value)}
          onKeyDown={handleBarcodeSearch}
          placeholder="Bipar código de barras para localizar item..."
          className="w-full border-2 border-gray-300 focus:border-blue-500 rounded-2xl px-5 py-4 text-xl outline-none transition-colors"
          disabled={searching}
        />

        {/* Result card */}
        {searchResult && (
          <div className={`mt-3 rounded-2xl px-5 py-4 text-base font-medium ${
            searchResult.action === 'already_done'
              ? 'bg-orange-50 border-2 border-orange-300 text-orange-800'
              : searchResult.action === 'in_progress_other'
              ? 'bg-yellow-50 border-2 border-yellow-300 text-yellow-800'
              : 'bg-red-50 border-2 border-red-300 text-red-800'
          }`}>
            {searchResult.action === 'already_done' && (() => {
              const m = searchResult.best_match
              return (
                <>
                  <p className="font-bold text-lg">✓ Item já concluído</p>
                  <p className="mt-1">
                    <strong>{searchResult.sku}</strong> foi concluído na lista{' '}
                    <strong>{m.session_code}</strong>
                    {m.operator_name && <> pelo operador <strong>{m.operator_name}</strong></>}
                    {' '}({m.qty_picked}/{m.qty_required} separados)
                  </p>
                </>
              )
            })()}

            {searchResult.action === 'in_progress_other' && (() => {
              const m = searchResult.best_match
              return (
                <>
                  <p className="font-bold text-lg">🔒 Item em separação por outro operador</p>
                  <p className="mt-1">
                    <strong>{searchResult.sku}</strong> está sendo separado por{' '}
                    <strong>{m.operator_name}</strong> na lista <strong>{m.session_code}</strong>
                  </p>
                </>
              )
            })()}

            {(searchResult.action === 'not_found' || searchResult.action === 'not_in_sessions') && (
              <>
                <p className="font-bold text-lg">✗ Código de barras não encontrado</p>
                <p className="mt-1 text-sm">
                  {searchResult.action === 'not_in_sessions'
                    ? `SKU "${searchResult.sku}" não está em nenhuma lista ativa.`
                    : 'Este código não está cadastrado no sistema.'}
                </p>
              </>
            )}

            {searchResult.action === 'error' && (
              <p className="font-bold">✗ Erro ao consultar — tente novamente</p>
            )}
          </div>
        )}
      </div>

      {loading && <p className="text-center text-gray-400 text-xl mt-16">Carregando...</p>}

      {!loading && (
        <>
          {/* Minhas listas em andamento */}
          {mySessions.length > 0 && (
            <div className="mb-8">
              <h3 className="text-lg font-semibold text-blue-600 uppercase tracking-wide mb-3">
                {mySessions.length === 1 ? 'Minha lista em andamento' : `Minhas listas em andamento (${mySessions.length})`}
              </h3>
              <div className="flex flex-col gap-4">
                {mySessions.map(s => (
                  <button
                    key={s.id}
                    onClick={() => navigate(`/sessions/${s.id}/items`)}
                    className="w-full bg-blue-50 border-2 border-blue-400 rounded-2xl p-6 text-left hover:bg-blue-100 transition-colors shadow"
                  >
                    <div className="flex justify-between items-center">
                      <span className="text-2xl font-bold">{s.session_code}</span>
                      <span className="text-blue-600 text-lg font-semibold">CONTINUAR →</span>
                    </div>
                    <ProgressBar picked={s.items_picked} total={s.items_total} />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Listas disponíveis */}
          <h3 className="text-lg font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Listas disponíveis
          </h3>

          {available.length === 0 && mySessions.length === 0 && (
            <p className="text-center text-gray-400 text-xl mt-8">
              Nenhuma lista disponível no momento.
            </p>
          )}

          {available.length === 0 && mySessions.length > 0 && (
            <p className="text-gray-400 text-center mt-4">Nenhuma outra lista disponível.</p>
          )}

          <div className="flex flex-col gap-4">
            {available.map(s => (
                <button
                  key={s.id}
                  onClick={() => openSession(s.id)}
                  className="bg-white border-2 border-gray-200 hover:border-blue-400 rounded-2xl p-6 text-left shadow transition-colors"
                >
                  <div className="flex justify-between items-center">
                    <span className="text-2xl font-bold">{s.session_code}</span>
                    <span className="text-gray-400 text-lg">
                      {`${s.items_total} unidades`}
                    </span>
                  </div>
                  <ProgressBar picked={s.items_picked} total={s.items_total} />
                </button>
            ))}
          </div>

          {/* Minhas listas concluídas */}
          {myDone.length > 0 && (
            <div className="mt-8">
              <h3 className="text-lg font-semibold text-green-600 uppercase tracking-wide mb-3">
                Minhas listas concluídas
              </h3>
              <div className="flex flex-col gap-4">
                {myDone.map(s => (
                  <button
                    key={s.id}
                    onClick={() => navigate(`/sessions/${s.id}/items`)}
                    className="bg-green-50 border-2 border-green-300 hover:border-green-500 rounded-2xl p-6 text-left shadow transition-colors"
                  >
                    <div className="flex justify-between items-center">
                      <span className="text-2xl font-bold text-gray-800">{s.session_code}</span>
                      <span className="text-green-600 font-semibold text-sm">✓ Concluída — VER →</span>
                    </div>
                    <ProgressBar picked={s.items_picked} total={s.items_total} color="green" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function ProgressBar({ picked, total, color = 'blue' }) {
  const pct = total ? Math.round((picked / total) * 100) : 0
  const barColor = color === 'green' ? 'bg-green-500' : 'bg-blue-500'
  return (
    <div className="mt-4 flex items-center gap-3">
      <div className="flex-1 h-3 bg-gray-200 rounded-full overflow-hidden">
        <div className={`h-full ${barColor} rounded-full`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-base text-gray-600 whitespace-nowrap">{picked}/{total} itens</span>
    </div>
  )
}
