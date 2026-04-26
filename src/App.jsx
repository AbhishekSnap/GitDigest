import { useEffect } from 'react'
import useStore from './store/useStore.js'
import { ToastProvider } from './context/ToastContext.jsx'
import LandingScreen   from './screens/LandingScreen.jsx'
import ReposScreen     from './screens/ReposScreen.jsx'
import DashboardScreen from './screens/DashboardScreen.jsx'

export default function App() {
  const { ghToken, currentRepo, isLight } = useStore()

  // Apply saved theme on mount
  useEffect(() => {
    document.documentElement.classList.toggle('light', isLight)
  }, [])

  let screen
  if (!ghToken) {
    screen = <LandingScreen />
  } else if (!currentRepo) {
    screen = <ReposScreen />
  } else {
    screen = <DashboardScreen />
  }

  return (
    <ToastProvider>
      {screen}
    </ToastProvider>
  )
}
