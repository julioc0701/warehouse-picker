import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'

export default function ShortageReport() {
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getShortageReport()
      .then(setItems)
      .finally(() => setLoading(false))
  }, [])

  const totalShortage = items.reduce((s, i) => s + i.shortage_qty, 0)

  return (
    <div className="min-h-screen bg-gray-100 p-8 max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-4xl font-bold">Relatório de Faltas</h1>
          <p className="text-gray-500 text-sm mt-1">
            SKUs com falta de estoque nas listas concluídas
          </p>
        </div>
        <button
          onClick={() => navigate('/supervisor')}
          className="text-blue-500 hover:underline text-lg"
        >
          ← Supervisor
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow p-6">
        {loading && (
          <p className="text-center text-gray-400 py-8">Carregando...</p>
        )}

        {!loading && items.length === 0 && (
          <p className="text-center text-gray-400 py-12 text-xl">
            ✓ Nenhuma falta registrada nas listas concluídas.
          </p>
        )}

        {!loading && items.length > 0 && (
          <>
            <div className="flex justify-between items-center mb-4">
              <p className="text-sm text-gray-500">
                {items.length} SKU{items.length !== 1 ? 's' : ''} com falta
              </p>
              <p className="text-sm font-semibold text-red-600">
                Total faltante: {totalShortage} unidades
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-gray-200 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    <th className="pb-3 pr-4">SKU</th>
                    <th className="pb-3 pr-4">Descrição</th>
                    <th className="pb-3 text-right text-red-500">Qtd Faltante</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {items.map(item => (
                    <tr key={item.sku} className="hover:bg-gray-50">
                      <td className="py-3 pr-4 font-mono font-semibold whitespace-nowrap">
                        {item.sku}
                      </td>
                      <td className="py-3 pr-4 text-gray-600">
                        {item.description || '—'}
                      </td>
                      <td className="py-3 text-right">
                        <span className="font-bold text-red-600 text-base">
                          -{item.shortage_qty}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
