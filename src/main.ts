import { createApp } from 'vue'
import App from './App.vue'
import { installDesktopApi } from './platform/install-desktop-api'
import 'uno.css'
import './assets/fonts/fonts.css'
import './assets/theme.css'

async function bootstrap(): Promise<void> {
  await installDesktopApi()
  createApp(App).mount('#app')
}

void bootstrap()
