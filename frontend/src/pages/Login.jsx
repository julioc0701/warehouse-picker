import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'

export default function Login() {
  const [operators, setOperators] = useState([])
  const [selected, setSelected] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    api.getOperators().then(setOperators).catch(() => setError('Não foi possível conectar ao servidor'))
  }, [])

  function handleConfirm() {
    const op = operators.find(o => o.id === Number(selected))
    if (!op) return
    sessionStorage.setItem('operator', JSON.stringify(op))
    navigate(op.name === 'Master' ? '/supervisor' : '/sessions')
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-8 p-8">
      <h1 className="text-5xl font-bold tracking-tight">WAREHOUSE PICKER</h1>

      <p className="text-center text-gray-500 text-xl">Selecione seu nome para começar</p>

      {error && <p className="text-red-600 text-center text-lg">{error}</p>}

      <div className="flex flex-col gap-4 w-full max-w-sm">
        <select
          value={selected}
          onChange={e => setSelected(e.target.value)}
          className="w-full border-2 border-gray-300 rounded-2xl p-4 text-2xl bg-white focus:outline-none focus:border-blue-500"
        >
          <option value="">— Selecionar operador —</option>
          {operators.map(op => (
            <option key={op.id} value={op.id}>{op.name}</option>
          ))}
        </select>

        <button
          onClick={handleConfirm}
          disabled={!selected}
          className="w-full py-5 bg-blue-600 text-white text-2xl font-bold rounded-2xl hover:bg-blue-700 disabled:opacity-40 transition-colors"
        >
          ENTRAR
        </button>
      </div>

    </div>
  )
}
