import { Plugin, Function, Autocmd, Command } from 'neovim'
import Commands from './commands'
import fs from 'fs'
import path from 'path'
const trash = require('trash')
const pify = require('pify')
const exec = require('child_process').exec
let opts = {}
let command = null

@Plugin({ dev: false })
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

  @Function('PlugRetry', { sync: false })
  async plugRetry(args) {
    let name = args[0]
    if (!name || !command) return
    let nr = await this.nvim.eval('bufnr("%")')
    command.update(nr, name, true)
  }

  @Command('PlugCheck', {
    sync: true,
  })
  async plugCheck() {
    // check not installed plugins
    let plugins = await this.nvim.call('plug#plugins', [])
    let dirs = []
    for (let plug of plugins) {
      let dir = plug.directory
      try {
        let stat = await pify(fs.stat)(dir)
        if (!stat.isDirectory()) {
          await this.nvim.command(`echoerr '${dir} not a directory!'`)
        } else {
          dirs.push(path.basename(dir))
        }
      } catch (e) {
        await this.nvim.command(`echoerr '${dir} not exists!'`)
      }
    }
    // check not activted plugins
    let baseDir = path.join(process.env.HOME, '.vim/bundle')
    let files = await pify(fs.readdir)(baseDir)
    for (let file of files) {
      let dir = path.join(baseDir, file)
      let stat = await pify(fs.stat)(dir)
      if (stat.isDirectory() && dirs.indexOf(file) === -1) {
        await this.nvim.command(`echom 'Removing ${file} to trash'`)
        await trash(dir)
      }
    }
  }

  @Command('PlugInstall', {
    sync: false,
    nargs: 1
  })
  async plugInstall(args) {
    if (!command) {
      await this.initCommand()
    }
    await this.nvim.command('edit plug://' + Date.now())
    let nr = await this.nvim.eval('bufnr("%")')
    command.install(nr, args[0])
  }

  @Function('PlugRemove', { sync: false })
  async plugRemove(args) {
    let name = args[0]
    let plugins = await this.nvim.call('plug#plugins', [])
    let plug = plugins.find(o => o.name == name)
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
