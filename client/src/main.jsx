import { DiscordSDK } from '@discord/embedded-app-sdk'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

if (new URLSearchParams(window.location.search).has('frame_id')) {
  const discord = new DiscordSDK('1553470711308353626')
  discord.ready().catch(console.error)
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
