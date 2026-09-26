import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/bricolage-grotesque/opsz.css'
import '@fontsource-variable/figtree'
import '@fontsource/caveat/700.css'
import './index.css'
import './image-test.css'
import App from './App.jsx'
import ImageTest from './screens/ImageTest.jsx'

const Page = window.location.pathname.replace(/\/$/, '') === '/image-test' ? ImageTest : App

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Page />
  </StrictMode>,
)
