import { Navigate, Route, Routes } from 'react-router-dom'

import { AppShell } from './layout/AppShell'
import { AssetPage } from './pages/AssetPage'
import { ChatPage } from './pages/ChatPage'
import { DashPage } from './pages/DashPage'
import { HealthPage } from './pages/HealthPage'
import { MePage } from './pages/MePage'
import { MemoryPage } from './pages/MemoryPage'

/**
 * App UI 路由表：六个一级 Tab（对话 / 掌舵 / 记忆 / 资产 / 健康 / 我的）。
 * 新增页面：在 pages/ 下建文件 → 在这里挂一条 Route（不要在组件里内联定义页面）。
 */
export function App() {
  return (
    <Routes>
      {/* 沉浸式页（不套 AppShell：游戏对局 / 沉浸式播放器等）挂在下面这行之前——
          它们自己用 `h-screen-dvh` 铺满可视区 */}
      <Route element={<AppShell />}>
        <Route index element={<ChatPage />} />
        <Route path="dash" element={<DashPage />} />
        <Route path="mem" element={<MemoryPage />} />
        <Route path="asset" element={<AssetPage />} />
        <Route path="health" element={<HealthPage />} />
        <Route path="me" element={<MePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
