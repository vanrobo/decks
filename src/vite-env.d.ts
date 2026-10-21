/// <reference types="vite/client" />

import type { CoreAPI } from './types'

declare global {
  interface Window {
    core?: CoreAPI
  }
}

export {}
