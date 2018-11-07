import { attach, NeovimClient } from '@chemzqm/neovim'
import { Attach } from '@chemzqm/neovim/lib/attach/attach'
import trash from 'trash'
import fs from 'fs'
import pify from 'pify'
import Commands from './commands'
import path from 'path'
import { exec } from 'child_process'

export default function(opts: Attach): void {
  const nvim: NeovimClient = attach(opts)
  let commands: Commands

  nvim.on('notification', async (method, args) => {
    switch (method) {
      case 'update': {
        await nvim.command('edit plug://' + Date.now())
        let nr = await nvim.call('bufnr', '%')
        if (args.length == 0) {
          commands.updateAll(nr)
        } else {
          commands.update(nr, args[0])
        }
        return
      }
      case 'retry': {
        let name = args[0]
        if (!name) return
        let nr = await nvim.call('bufnr', '%')
        commands.update(nr, name, true)
        return
      }
      case 'check': {
        // check not installed plugins
        let plugins = await nvim.call('plug#plugins', [])
        let dirs = []
        for (let plug of plugins) {
          let dir = plug.directory
          try {
            let stat = await pify(fs.stat)(dir)
            if (!stat.isDirectory()) {
              await nvim.command(`echoerr '${dir} not a directory!'`)
            } else {
              dirs.push(path.basename(dir))
            }
          } catch (e) {
            await nvim.command(`echoerr '${dir} not exists!'`)
          }
        }
        // check not activted plugins
        let baseDir = path.join(process.env.HOME, '.vim/bundle')
        let files = await pify(fs.readdir)(baseDir)
        for (let file of files) {
          let dir = path.join(baseDir, file)
          let stat = await pify(fs.stat)(dir)
          if (stat.isDirectory() && dirs.indexOf(file) === -1) {
            await nvim.command(`echom 'Removing ${file} to trash'`)
            await trash(dir)
          }
        }
        await nvim.command(`echo 'check completed!'`)
        return
      }
      case 'install': {
        await nvim.command('edit plug://' + Date.now())
        let nr = await nvim.call('bufnr', '%')
        await commands.install(nr, args[0])
      }
      case 'remove': {
        let name = args[0]
        let plugins = await nvim.call('plug#plugins', [])
        let plug = plugins.find(o => o.name == name)
        if (plug) {
          await trash(plug.directory)
          await nvim.command(`echom "Removed ${plug.directory}"`)
        }
        return
      }
      case 'diff': {
        commands.diff(args[0], args[1])
        return
      }
      case 'log': {
        commands.showLog(args[0], args[1])
        return
      }
    }
  })

  nvim.channelId.then(async channelId => {
    let threads = await nvim.getVar('plug_threads') as number
    let timeout = await nvim.getVar('plug_timeout') as number
    let shadow = await nvim.getVar('plug_shadow') as boolean
    let rebase = await nvim.getVar('plug_rebase') as boolean
    let plugins = await nvim.call('plug#plugins', []) as any[]
    let output = await pify(exec)('git --version')
    let version = output.replace('git version', '').replace(/\n/g, '')

    commands = new Commands(nvim, {
      threads,
      timeout,
      shadow,
      rebase,
      plugins,
      version
    })

    await nvim.setVar('plug_channel_id', channelId)
  }).catch(e => {
    console.log(e.message)
  })
}
