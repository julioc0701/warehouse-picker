import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'

export default function SessionSelect() {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [claiming, setClaiming] = useState(null)
  const navigate = useNavigate()
  const operator = JSON.parse(sessionStorage.getItem('operator') || 'null')

  useEffect(() => {
    if (!operator) { navigate('/'); return }
    load()
  }, [])

  function load() {
    setLoading(true)
    api.getSessions()
      .then(data => setSessions(data))
      .finally(() => setLoading(false))
  }

  // Lista que este operador já está trabalhando
  const mySession = sessions.find(
    s => s.operator_id === operator?.id && s.status === 'in_progress'
  )

  // Listas disponíveis (abertas, sem operador)
  const available = sessions.filter(s => s.status === 'open' && !s.operator_id)

  // Listas que este operador já concluiu
  const myDone = sessions.filter(
    s => s.operator_id === operator?.id && s.status === 'completed'
  )

  async function claim(sessionId) {
    setClaiming(sessionId)
    try {
      await api.claimSession(sessionId, operator.id)
      navigate(`/sessions/${sessionId}/items`)
    } catch (err) {
      alert(err.message)
      setClaiming(null)
      load()
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

      {loading && <p className="text-center text-gray-400 text-xl mt-16">Carregando...</p>}

      {!loading && (
        <>
          {/* Minha lista em andamento */}
          {mySession && (
            <div className="mb-8">
              <h3 className="text-lg font-semibold text-blue-600 uppercase tracking-wide mb-3">
                Minha lista em andamento
              </h3>
              <button
                onClick={() => navigate(`/sessions/${mySession.id}/items`)}
                className="w-full bg-blue-50 border-2 border-blue-400 rounded-2xl p-6 text-left hover:bg-blue-100 transition-colors shadow"
              >
                <div className="flex justify-between items-center">
                  <span className="text-2xl font-bold">{mySession.session_code}</span>
                  <span className="text-blue-600 text-lg font-semibold">CONTINUAR →</span>
                </div>
                <ProgressBar picked={mySession.items_picked} total={mySession.items_total} />
              </button>
            </div>
          )}

          {/* Listas disponíveis */}
          <h3 className="text-lg font-semibold text-gray-500 uppercase tracking-wide mb-3">
            Listas disponíveis
          </h3>

          {available.length === 0 && !mySession && (
            <p className="text-center text-gray-400 text-xl mt-8">
              Nenhuma lista disponível no momento.
            </p>
          )}

          {available.length === 0 && mySession && (
            <p className="text-gray-400 text-center mt-4">Nenhuma outra lista disponível.</p>
          )}

          <div className="flex flex-col gap-4">
            {available.map(s => {
              const isClaiming = claiming === s.id
              return (
                <button
                  key={s.id}
                  onClick={() => claim(s.id)}
                  disabled={!!claiming}
                  className="bg-white border-2 border-gray-200 hover:border-blue-400 rounded-2xl p-6 text-left shadow transition-colors disabled:opacity-60"
                >
                  <div className="flex justify-between items-center">
                    <span className="text-2xl font-bold">{s.session_code}</span>
                    <span className="text-gray-400 text-lg">
                      {isClaiming ? 'Reservando...' : `${s.items_total} unidades`}
                    </span>
                  </div>
                  <ProgressBar picked={s.items_picked} total={s.items_total} />
                </button>
              )
            })}
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
