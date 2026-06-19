import type { ConnectionApi } from '../shared/connection'
import type { RecordingApi } from '../shared/recording'

export {}

declare global {
  interface Window {
    api: {
      getAppVersion: () => Promise<string>
      getSurajLol: () => Promise<string>
      getSomeOtherThing: () => string
      connection: ConnectionApi
      recording: RecordingApi
    }
  }
}
