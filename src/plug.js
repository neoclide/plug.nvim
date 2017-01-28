const exec = require('child_process').exec
const attach = require('neovim-client')
const Serial = require('node-serial')
const net = require('net')
const Commands = require('./commands')

const conn = net.connect({path: process.env.NVIM_LISTEN_ADDRESS})

attach(conn, conn, function (err, nvim) {
  if (err) return onError('connect error: ' + err.message)
  let command

  nvim.on('notification', (method, args) => {
    switch (method) {
      case 'diff':
        command.diff(args[0], args[1])
        break
      case 'update':
        if (args[1]) {
          command.update(args[0], args[1])
        } else {
          command.updateAll(args[0])
        }
        break
      case 'log':
        command.showLog(args[0], args[1])
    }
  })

  nvim.on('request', (method, args, resp) => {
  })

  let s = new Serial()
  let opts = {}
  s.add(done => {
    nvim.eval('g:plug_threads', (err, res) => {
      opts.threads = res
      done(err)
    })
  })
  s.add(done => {
    nvim.eval('g:plug_timeout', (err, res) => {
      opts.timeout = res
      done(err)
    })
  })
  s.add(done => {
    nvim.eval('g:plug_shadow', (err, res) => {
      opts.shadow = res
      done(err)
    })
  })
  s.add(done => {
    nvim.eval('g:plug_rebase', (err, res) => {
      opts.rebase = res
      done(err)
    })
  })
  s.add(done => {
    exec('git --version', (err, stdout) => {
      if (err) return done(err)
      opts.version = stdout.replace('git version', '').replace(/\n/g, '')
      done()
    })
  })
  s.add(done => {
    nvim.callFunction('plug#plugins', [], (err, res) => {
      if (err) return done(err)
      opts.plugins = res
      command = new Commands(nvim, opts)
      done()
    })
  })
  s.add(done => {
    nvim.command('let g:plug_nvim_node_channel=' + nvim._channel_id, err => {
      done(err)
    })
  })
  s.done(err => {
    if (err) return onError(err.message)
  })
})

function onError(msg) {
  console.error(msg)
  process.exit(1)
}

process.on('uncaughtException', function(err) {
  console.error('[plug.nvim] exception: ' + err.stack);
})
