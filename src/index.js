import { Plugin, Function, Autocmd, Command } from 'neovim'
import Commands from './commands'
import fs from 'fs'
const trash = require('trash')
const pify = require('pify')
const exec = require('child_process').exec
let opts = {}
let command = null

@Plugin({ dev: true })
export default class Plug {

  async initCommand() {
    opts.threads = await this.nvim.getVar('plug_threads')
    opts.timeout = await this.nvim.getVar('plug_timeout')
    opts.shadow = await this.nvim.getVar('plug_shadow')
    opts.rebase = await this.nvim.getVar('plug_rebase')
    opts.plugins = await this.nvim.call('plug#plugins', [])
    let output = await pify(exec)('git --version')
    opts.version = output.replace('git version', '').replace(/\n/g, '')
    command = new Commands(this.nvim, opts)
  }

  @Function('PlugUpdate', { sync: false })
  async plugUpdate(args) {
    if (!command) {
      await this.initCommand()
    }
    await this.nvim.command('edit plug://' + Date.now())
    let nr = await this.nvim.eval('bufnr("%")')
    if (args.length == 0) {
      command.updateAll(nr)
    } else {
      command.update(nr, args[0])
    }
  }

  @Command('PlugCheck', {
    sync: true,
  })
  async plugCheck() {
    let plugins = await this.nvim.call('plug#plugins', [])
    for (let plug of plugins) {
      let stat = await pify(fs.stat)(plug.directory)
      if (!stat.isDirectory()) {
        await this.nvim.command('echoerr ' + plug.directory + ' not exists!')
      }
    }
  }

  @Command('PlugRemove', {
    sync: false,
    args: '*'
  })
  async plugRemove(args) {
    let plugins = await this.nvim.call('plug#plugins', [])
    let plug = plugins.find(o => o.name == args[0])
    if (plug) {
      await trash(plug.directory)
      await this.nvim.command(`echom "Removed ${plug.directory}"`)
    }
  }


  @Function('PlugDiff', {sync: false})
  async plugDiff(args) {
    command.diff(args[0], args[1])
  }

  @Function('PlugLog', {sync: false})
  async plugLog(args) {
    command.showLog(args[0], args[1])
  }
}

process.on('uncaughtException', function(err) {
  console.error('Caught exception: ' + err);
});
