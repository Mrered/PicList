// TODO: so how to import pure esm module in electron main process????? help wanted

// just copy the fix-path because I can't import pure ESM module in electron main process
// @ts-nocheck since the module is not pure ESM
// shell-path 3.0.0 not work

const shellPath = require('shell-path')

export default function fixPath() {
  if (process.platform === 'win32') {
    return
  }

  process.env.PATH =
    shellPath.sync() || ['./node_modules/.bin', '/.nodebrew/current/bin', '/usr/local/bin', process.env.PATH].join(':')
}
