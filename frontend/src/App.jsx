import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import SessionSelect from './pages/SessionSelect'
import SessionItems from './pages/SessionItems'
import Picking from './pages/Picking'
import Supervisor from './pages/Supervisor'
import MasterData from './pages/MasterData'
import ShortageReport from './pages/ShortageReport'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/sessions" element={<SessionSelect />} />
        <Route path="/sessions/:sessionId/items" element={<SessionItems />} />
        <Route path="/picking/:sessionId" element={<Picking />} />
        <Route path="/supervisor" element={<Supervisor />} />
        <Route path="/master-data" element={<MasterData />} />
        <Route path="/shortage-report" element={<ShortageReport />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  )
}
