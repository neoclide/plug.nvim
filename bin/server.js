const attach = require('../lib/attach').default
const address = process.argv[2] || process.env.NVIM_LISTEN_ADDRESS || '/tmp/nvim'

attach({
  socket: address
})

process.on('uncaughtException', function (err) {
  console.error(err.stack)
})

process.on('unhandledRejection', function (reason) {
  if (reason instanceof Error) {
    console.error('UnhandledRejection: ' + reason.message + '\n' + reason.stack)
  } else {
    console.error('UnhandledRejection: ' + reason)
  }
})

