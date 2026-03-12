import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'

// ── Trash icon SVG (inline, no extra dependency) ─────────────────────────────
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
const STATUS_COLOR = { open: 'text-gray-500', in_progress: 'text-blue-600', completed: 'text-green-600' }

export default function Supervisor() {
  const navigate = useNavigate()
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
  const [agentInfo, setAgentInfo] = useState(null)   // null=checking | {ok,printer,all_printers}
  const agentCheckRef = useRef(false)

  useEffect(() => { refresh() }, [])

  // Check local print agent on mount
  useEffect(() => {
    if (agentCheckRef.current) return
    agentCheckRef.current = true
    checkAgent()
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
    })
  }

  async function handleUpload(e) {
    e.preventDefault()
    if (!files.pdf) return alert('Selecione o PDF da lista de picking')
    setUploading(true)
    setUploadResult(null)
    try {
      const fd = new FormData()
      fd.append('session_code', form.session_code)
      fd.append('picking_pdf', files.pdf)
      if (files.txt) fd.append('labels_txt', files.txt)
      const res = await api.uploadSession(fd)
      setUploadResult({
        ok: true,
        msg: `✔ ${res.lists_created} lista(s) criada(s) com ${res.total_items} SKUs no total`
      })
      setForm({ session_code: '' })
      setFiles({ pdf: null, txt: null })
      refresh()
    } catch (err) {
      setUploadResult({ ok: false, msg: err.message })
    } finally {
      setUploading(false)
    }
  }

  async function handleAddPrinter(e) {
    e.preventDefault()
    await api.createPrinter(newPrinter.name, newPrinter.ip_address, Number(newPrinter.port))
    setNewPrinter({ name: '', ip_address: '', port: 9100 })
    refresh()
  }

  async function handleImportExcel(e) {
    e.preventDefault()
    if (!excelFile) return
    setImportingExcel(true)
    setExcelResult(null)
    try {
      const fd = new FormData()
      fd.append('file', excelFile)
      const res = await api.importBarcodesExcel(fd)
      setExcelResult({ ok: true, msg: `✔ ${res.added} EANs importados (${res.deleted ?? 0} anteriores removidos)` })
    } catch (err) {
      setExcelResult({ ok: false, msg: err.message })
    } finally {
      setImportingExcel(false)
    }
  }

  const available = sessions.filter(s => s.status === 'open')
  const active = sessions.filter(s => s.status === 'in_progress')
  const done = sessions.filter(s => s.status === 'completed')

  const totalPicked = sessions.reduce((sum, s) => sum + (s.items_picked || 0), 0)
  const totalItems = sessions.reduce((sum, s) => sum + (s.items_total || 0), 0)
  const totalPct = totalItems ? Math.round((totalPicked / totalItems) * 100) : 0

  return (
    <div className="min-h-screen bg-gray-100 p-8 max-w-5xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-4xl font-bold">Painel do Supervisor</h1>
        <a href="/" className="text-blue-500 hover:underline text-lg">← Login do Operador</a>
      </div>

      <div className="grid grid-cols-1 gap-8">

        {/* Upload Session */}
        <div className="bg-white rounded-2xl shadow p-6">
          <h2 className="text-2xl font-bold mb-1">Carregar Novo Envio</h2>
          <p className="text-gray-500 text-sm mb-4">
            O sistema divide automaticamente em listas de até 1.000 unidades, ordenadas do maior para o menor.
          </p>
          <form onSubmit={handleUpload} className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Código do Envio</label>
              <input className="w-full border-2 border-gray-300 rounded-xl p-3 text-lg"
                placeholder="ex: Envio-62040720"
                value={form.session_code}
                onChange={e => setForm(f => ({ ...f, session_code: e.target.value }))}
                required />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Lista de Picking (PDF)</label>
                <input type="file" accept=".pdf" className="w-full border-2 border-gray-300 rounded-xl p-3"
                  onChange={e => setFiles(f => ({ ...f, pdf: e.target.files[0] }))} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Etiquetas (TXT/ZPL) <span className="text-gray-400 font-normal">— opcional</span>
                </label>
                <input type="file" accept=".txt,.zpl" className="w-full border-2 border-gray-300 rounded-xl p-3"
                  onChange={e => setFiles(f => ({ ...f, txt: e.target.files[0] || null }))} />
              </div>
            </div>
            <button type="submit" disabled={uploading}
              className="py-4 bg-blue-600 text-white rounded-xl text-xl font-bold hover:bg-blue-700 disabled:opacity-50">
              {uploading ? 'Processando...' : 'CRIAR LISTAS DE PICKING'}
            </button>
            {uploadResult && (
              <p className={`text-center text-lg ${uploadResult.ok ? 'text-green-600' : 'text-red-600'}`}>
                {uploadResult.msg}
              </p>
            )}
          </form>
        </div>

        {/* Import Excel */}
        <div className="bg-white rounded-2xl shadow p-6">
          <h2 className="text-2xl font-bold mb-1">Master Data — Códigos de Barras</h2>
          <p className="text-gray-500 text-sm mb-4">Importa EAN → SKU do Excel (ML_FULL_SKU_DESCRICAO.xlsx). Faça isso antes de criar as listas.</p>
          <form onSubmit={handleImportExcel} className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Arquivo Excel (.xlsx)</label>
              <input type="file" accept=".xlsx"
                className="w-full border-2 border-gray-300 rounded-xl p-3"
                onChange={e => setExcelFile(e.target.files[0])} required />
            </div>
            <button type="submit" disabled={importingExcel || !excelFile}
              className="py-3 px-6 bg-green-600 text-white rounded-xl text-lg font-bold hover:bg-green-700 disabled:opacity-50 whitespace-nowrap">
              {importingExcel ? 'Importando...' : 'IMPORTAR'}
            </button>
          </form>
          {excelResult && (
            <p className={`text-center text-lg mt-3 ${excelResult.ok ? 'text-green-600' : 'text-red-600'}`}>
              {excelResult.msg}
            </p>
          )}
        </div>

        {/* Master Data Viewer */}
        <div className="bg-white rounded-2xl shadow p-6 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold">Master Data — Produtos Cadastrados</h2>
            <p className="text-gray-500 text-sm mt-0.5">
              Consulte e pesquise os SKUs e EANs importados para conferência de erros.
            </p>
          </div>
          <button
            onClick={() => navigate('/master-data')}
            className="py-3 px-6 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 whitespace-nowrap"
          >
            🔍 Visualizar Produtos
          </button>
        </div>

        {/* Shortage Report */}
        <div className="bg-white rounded-2xl shadow p-6 flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold">Relatório de Faltas</h2>
            <p className="text-gray-500 text-sm mt-0.5">
              SKUs com falta de estoque consolidados das listas concluídas.
            </p>
          </div>
          <button
            onClick={() => navigate('/shortage-report')}
            className="py-3 px-6 bg-red-600 text-white rounded-xl text-sm font-bold hover:bg-red-700 whitespace-nowrap"
          >
            ⚠ Ver Faltas
          </button>
        </div>

        {/* Sessions monitor */}
        <div className="bg-white rounded-2xl shadow p-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold">Monitor de Listas</h2>
            <button onClick={refresh} className="text-sm text-blue-500 hover:underline">↻ Atualizar</button>
          </div>

          {sessions.length > 0 && (
            <div className="mb-6 p-4 bg-gray-50 rounded-xl">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-semibold text-gray-600 uppercase tracking-wide">Progresso Total do Envio</span>
                <span className="text-lg font-bold text-gray-800">{totalPicked.toLocaleString('pt-BR')}/{totalItems.toLocaleString('pt-BR')} unidades</span>
              </div>
              <div className="w-full h-4 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all"
                  style={{ width: `${totalPct}%` }}
                />
              </div>
              <div className="flex justify-between items-center mt-1">
                <span className="text-xs text-gray-500">{done.length}/{sessions.length} listas concluídas</span>
                <span className="text-sm font-semibold text-blue-600">{totalPct}%</span>
              </div>
            </div>
          )}

          {sessions.length === 0 && (
            <p className="text-gray-400 text-center py-8">Nenhuma lista criada ainda.</p>
          )}

          {active.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-blue-600 uppercase tracking-wide mb-2">Em andamento</h3>
              {active.map(s => <SessionRow key={s.id} s={s} onDeleted={refresh} />)}
            </div>
          )}

          {available.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Disponíveis</h3>
              {available.map(s => <SessionRow key={s.id} s={s} onDeleted={refresh} />)}
            </div>
          )}

          {done.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-green-600 uppercase tracking-wide mb-2">Concluídas</h3>
              {done.map(s => <SessionRow key={s.id} s={s} onDeleted={refresh} />)}
            </div>
          )}
        </div>



      </div>
    </div>
  )
}

function SessionRow({ s, onDeleted }) {
  const [confirm, setConfirm] = useState(false)       // delete confirm
  const [confirmReopen, setConfirmReopen] = useState(false) // reopen confirm
  const [deleting, setDeleting] = useState(false)
  const [reopening, setReopening] = useState(false)
  const [errMsg, setErrMsg] = useState(null)
  const pct = s.items_total ? Math.round((s.items_picked / s.items_total) * 100) : 0

  async function doReopen() {
    setReopening(true)
    setConfirmReopen(false)
    try {
      await api.reopenSession(s.id)
      onDeleted()
    } catch (err) {
      setErrMsg(err.message)
      setTimeout(() => setErrMsg(null), 3000)
    } finally {
      setReopening(false)
    }
  }

  async function handleDelete() {
    if (s.status === 'in_progress') {
      setErrMsg('Não é possível excluir uma lista em andamento.')
      setTimeout(() => setErrMsg(null), 3000)
      return
    }
    setConfirm(true)
  }

  async function confirmDelete() {
    setDeleting(true)
    try {
      await api.deleteSession(s.id)
      onDeleted()
    } catch (err) {
      setErrMsg(err.message)
      setTimeout(() => setErrMsg(null), 3000)
      setConfirm(false)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="border-b last:border-0">
      <div className="flex items-center gap-4 py-3">
        <span className="font-mono font-semibold w-48 truncate">{s.session_code}</span>
        <span className="text-gray-500 w-32 text-sm">{s.operator_name || '—'}</span>
        <div className="flex-1 flex items-center gap-2">
          <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-sm text-gray-600 whitespace-nowrap">{s.items_picked}/{s.items_total}</span>
        </div>
        {(s.status === 'completed' || s.status === 'in_progress') && !confirmReopen ? (
          <button
            onClick={() => setConfirmReopen(true)}
            disabled={reopening}
            title="Clique para reinicializar a lista"
            className={`text-sm font-medium w-28 text-right disabled:opacity-50 transition-colors cursor-pointer hover:underline ${
              s.status === 'completed'
                ? 'text-green-600 hover:text-blue-600'
                : 'text-blue-600 hover:text-orange-500'
            }`}
          >
            {reopening ? 'Aguarde...' : s.status === 'completed' ? '✓ Concluída' : 'Em andamento'}
          </button>
        ) : s.status === 'open' ? (
          <span className="text-sm font-medium w-28 text-right text-gray-500">Disponível</span>
        ) : null}

        {confirmReopen && (
          <div className="flex items-center gap-1 w-28 justify-end">
            <button
              onClick={() => setConfirmReopen(false)}
              className="px-2 py-1 text-xs rounded border border-gray-300 hover:bg-gray-100"
            >
              Não
            </button>
            <button
              onClick={doReopen}
              disabled={reopening}
              className="px-2 py-1 text-xs rounded bg-orange-500 text-white hover:bg-orange-600 disabled:opacity-50"
            >
              Sim
            </button>
          </div>
        )}
        {/* Trash button */}
        {!confirm ? (
          <button
            onClick={handleDelete}
            title="Excluir lista"
            className={`p-1.5 rounded-lg transition-colors ${
              s.status === 'in_progress'
                ? 'text-gray-300 cursor-not-allowed'
                : 'text-gray-400 hover:text-red-500 hover:bg-red-50'
            }`}
          >
            <TrashIcon />
          </button>
        ) : (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setConfirm(false)}
              className="px-2 py-1 text-xs rounded border border-gray-300 hover:bg-gray-100"
            >
              Não
            </button>
            <button
              onClick={confirmDelete}
              disabled={deleting}
              className="px-2 py-1 text-xs rounded bg-red-500 text-white hover:bg-red-600 disabled:opacity-50"
            >
              {deleting ? '...' : 'Sim'}
            </button>
          </div>
        )}
      </div>
      {/* Reopen confirmation prompt */}
      {confirmReopen && (
        <p className="text-xs text-orange-500 pb-2 pl-1">
          Reinicializar esta lista? Ela voltará para a fila e o operador perderá o acesso.
        </p>
      )}
      {/* Delete confirmation prompt */}
      {confirm && !deleting && (
        <p className="text-xs text-red-500 pb-2 pl-1">
          Excluir esta lista? Esta ação não pode ser desfeita.
        </p>
      )}
      {/* Error message */}
      {errMsg && (
        <p className="text-xs text-red-500 pb-2 pl-1">{errMsg}</p>
      )}
    </div>
  )
}
