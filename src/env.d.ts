interface Window {
  api: {
    getAppVersion: () => Promise<string>
    getSurajLol: () => Promise<string>
    getSomeOtherThing: () => string
  }
}
