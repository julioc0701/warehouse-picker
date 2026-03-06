import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './pages/Login'
import SessionSelect from './pages/SessionSelect'
import SessionItems from './pages/SessionItems'
import Picking from './pages/Picking'
import Supervisor from './pages/Supervisor'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/sessions" element={<SessionSelect />} />
        <Route path="/sessions/:sessionId/items" element={<SessionItems />} />
        <Route path="/picking/:sessionId" element={<Picking />} />
        <Route path="/supervisor" element={<Supervisor />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </BrowserRouter>
  )
}
