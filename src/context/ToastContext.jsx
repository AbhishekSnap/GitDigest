import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { esc } from '../utils/index.js'

const ToastContext = createContext(null)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const idRef = useRef(0)

  const addToast = useCallback((icon, title, msg) => {
    const id = ++idRef.current
    setToasts(prev => [...prev, { id, icon, title, msg }])
    setTimeout(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, fading: true } : t))
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 300)
    }, 3500)
  }, [])

  return (
    <ToastContext.Provider value={addToast}>
      {children}
      <div className="toast-wrap" id="toast-wrap">
        {toasts.map(t => (
          <div key={t.id} className={`toast${t.fading ? ' fading' : ''}`}>
            <span className="t-icon">{t.icon}</span>
            <div>
              <div className="t-title">{t.title}</div>
              <div className="t-msg">{t.msg}</div>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}
