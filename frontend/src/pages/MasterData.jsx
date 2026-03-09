import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'

export default function MasterData() {
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const timerRef = useRef(null)

  useEffect(() => {
    load('')
  }, [])

  async function load(q) {
    setLoading(true)
    try {
      const res = await api.listBarcodes(q)
      // Support both old (array) and new ({total, items}) response shapes
      if (Array.isArray(res)) {
        setItems(res.filter(b => b.is_primary !== false))
        setTotal(res.filter(b => b.is_primary !== false).length)
      } else {
        setItems(res.items || [])
        setTotal(res.total ?? res.results ?? 0)
      }
    } catch {
      setItems([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }

  function handleSearch(e) {
    const v = e.target.value
    setSearch(v)
    clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => load(v), 350)
  }

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">

      {/* Header */}
      <div className="bg-white shadow px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Master Data — Produtos Cadastrados</h1>
          <p className="text-gray-500 text-sm mt-0.5">
            {loading ? 'Carregando...' : `${total} produtos cadastrados no total`}
          </p>
        </div>
        <button
          onClick={() => navigate('/supervisor')}
          className="text-gray-400 hover:text-gray-700 text-lg"
        >
          ← Voltar
        </button>
      </div>

      <div className="flex-1 p-6 max-w-4xl mx-auto w-full flex flex-col gap-4">

        {/* Search */}
        <div className="bg-white rounded-2xl shadow p-4">
          <input
            type="text"
            autoFocus
            placeholder="🔍  Buscar por SKU ou código de barras (EAN)..."
            value={search}
            onChange={handleSearch}
            className="w-full border-2 border-gray-200 focus:border-blue-400 rounded-xl p-3 text-base outline-none transition-colors"
          />
          {search && !loading && (
            <p className="text-xs text-gray-400 mt-2 pl-1">
              {items.length} resultado(s) para &quot;{search}&quot;
            </p>
          )}
        </div>

        {/* Table */}
        <div className="bg-white rounded-2xl shadow overflow-hidden">

          {/* Table header */}
          <div className="px-5 py-3 bg-gray-50 border-b flex justify-between items-center">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              {loading
                ? 'Carregando...'
                : search
                  ? `${items.length} resultado(s)`
                  : `${items.length} de ${total} produtos`
              }
            </span>
            {!search && total > items.length && (
              <span className="text-xs text-orange-500 font-medium">
                Use a busca para encontrar um produto específico
              </span>
            )}
          </div>

          {loading ? (
            <div className="text-center text-gray-400 py-16 text-xl">Carregando...</div>
          ) : items.length === 0 ? (
            <div className="text-center text-gray-400 py-16">
              {search
                ? <><p className="text-xl mb-2">Nenhum produto encontrado</p><p className="text-sm">Tente outro SKU ou código de barras</p></>
                : <><p className="text-xl mb-2">Nenhum produto cadastrado</p><p className="text-sm">Importe o arquivo Excel na tela do Supervisor</p></>
              }
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-gray-500 uppercase text-xs tracking-wide border-b bg-gray-50">
                  <th className="text-left px-5 py-3 font-semibold w-[18%]">SKU</th>
                  <th className="text-left px-5 py-3 font-semibold w-[35%]">Descrição</th>
                  <th className="text-left px-5 py-3 font-semibold">Código(s) de Barras</th>
                </tr>
              </thead>
              <tbody>
                {items.map((b, idx) => (
                  <tr
                    key={b.sku}
                    className={`border-t border-gray-100 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'}`}
                  >
                    <td className="px-5 py-3 font-mono font-bold text-gray-800 align-top">{b.sku}</td>
                    <td className="px-5 py-3 text-gray-700 align-top">
                      {b.description || <span className="text-gray-300">—</span>}
                    </td>
                    <td className="px-5 py-3 align-top">
                      <div className="flex flex-wrap gap-1">
                        {(b.barcodes ?? [{ barcode: b.barcode, is_primary: true, learned: false }]).map(bc => (
                          <span
                            key={bc.barcode}
                            title={bc.learned ? 'Aprendido durante bipagem' : 'Importado'}
                            className={`font-mono text-xs px-2 py-1 rounded ${
                              bc.learned
                                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                : 'bg-gray-100 text-gray-700'
                            }`}
                          >
                            {bc.barcode}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

      </div>
    </div>
  )
}
