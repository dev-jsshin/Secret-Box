import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Register from './pages/Register';
import Login from './pages/Login';
import Vault from './pages/Vault';

import { setSessionExpiredHandler } from './api/client';
import { useSessionStore } from './store/session';

function SessionExpiryBridge() {
  const clear = useSessionStore((s) => s.clear);

  useEffect(() => {
    setSessionExpiredHandler(() => {
      clear();
      // 다음 렌더 사이클에서 protected 페이지의 useEffect가 /login으로 이동시킴
    });
  }, [clear]);

  return null;
}

export default function App() {
  return (
    <BrowserRouter>
      <SessionExpiryBridge />
      <Routes>
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/vault" element={<Vault />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
