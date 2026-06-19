const { execFileSync, spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const electronVite = path.join(root, 'node_modules/electron-vite/bin/electron-vite.js')
const env = { ...process.env }

if (process.platform === 'darwin') {
  const electronPackage = require('electron/package.json')
  const sourceApp = path.join(root, 'node_modules/electron/dist/Electron.app')
  const devDirectory = path.join(root, '.dev')
  const devApp = path.join(devDirectory, 'WorkTrace AI.app')
  const versionFile = path.join(devDirectory, 'electron-version')
  const expectedVersion = electronPackage.version
  const currentVersion = fs.existsSync(versionFile)
    ? fs.readFileSync(versionFile, 'utf8').trim()
    : ''

  if (!fs.existsSync(devApp) || currentVersion !== expectedVersion) {
    fs.rmSync(devDirectory, { recursive: true, force: true })
    fs.mkdirSync(devDirectory, { recursive: true })
    execFileSync('ditto', [sourceApp, devApp], { stdio: 'inherit' })

    const infoPlist = path.join(devApp, 'Contents/Info.plist')
    const plistBuddy = '/usr/libexec/PlistBuddy'
    execFileSync(plistBuddy, ['-c', 'Set :CFBundleIdentifier com.worktrace.ai.dev', infoPlist])
    execFileSync(plistBuddy, ['-c', 'Set :CFBundleName WorkTrace AI', infoPlist])
    execFileSync(plistBuddy, ['-c', 'Set :CFBundleDisplayName WorkTrace AI', infoPlist])
    execFileSync(
      'codesign',
      ['--force', '--deep', '--sign', '-', '--identifier', 'com.worktrace.ai.dev', devApp],
      { stdio: 'inherit' }
    )
    fs.writeFileSync(versionFile, `${expectedVersion}\n`)
  }

  env.ELECTRON_EXEC_PATH = path.join(devApp, 'Contents/MacOS/Electron')
}

const child = spawn(process.execPath, [electronVite, ...process.argv.slice(2)], {
  cwd: root,
  env,
  stdio: 'inherit'
})

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => child.kill(signal))
}

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 0)
})
