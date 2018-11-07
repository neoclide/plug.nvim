import { spawn, exec } from 'child_process'
import path from 'path'
import * as util from './util'
import semver from 'semver'
import Parallel from 'node-parallel'
import Serial from 'node-serial'
import fs from 'fs'
import { NeovimClient as Neovim } from '@chemzqm/neovim'
import { Config, Status, Logs } from './types'

export default class Commands {
  private status: { [key: string]: Status }
  private shadow: boolean
  private threads: number
  private timeout: number
  private plugins: any[]
  private useRebase: boolean
  private logs: Logs
  private ellipse: number
  private updating: boolean
  private total = 0
  constructor(private nvim: Neovim, private config: Config) {
    this.status = {}
    this.logs = {}
    this.shadow = config.shadow
    this.threads = config.threads
    this.timeout = config.timeout
    this.plugins = config.plugins
    this.useRebase = config.rebase && semver.gt(config.version, '2.9.0')
    let updating = false
    Object.defineProperty(this, 'updating', {
      get: () => {
        return updating
      },
      set: val => {
        updating = val
        this.nvim.command(`let g:plug_updating=${val ? 1 : 0}`, true)
      }
    })
  }
  public updateRemotePlugins(): void {
    let stats = this.status
    let dirs = []
    Object.keys(stats).forEach(key => {
      let stat = stats[key]
      if (!stat.revs.from || stat.revs.to !== stat.revs.from) {
        dirs.push(key)
      }
    })
    const p = new Parallel()
    let shouldUpdate = false
    dirs.forEach(dir => {
      p.add(done => {
        let docRoot = path.join(dir, 'doc')
        util.isDirectory(docRoot).then(res => {
          if (res) this.nvim.command(`helptags ${docRoot}`, true)
        }).then(() => {
          util.isRemote(dir).then(res => {
            if (res) shouldUpdate = true
            done()
          }, done)
        }, done)
      })
    })
    p.done(() => {
      if (shouldUpdate) {
        this.nvim.command('UpdateRemotePlugins', true)
      }
    })
  }

  public updateAll(buf): void {
    this.status = {}
    this.logs = {}
    this.total = this.plugins.length
    if (this.updating) {
      this.showErrorMsg('Plugin update in process')
      return
    }
    let interval = setInterval(() => {
      this.updateView(buf)
    }, 200)
    let plugins = this.plugins.filter(o => !o.frozen)
    plugins.sort((a, b) => a.name > b.name ? 1 : -1)
    let fns = plugins.map(plugin => {
      return () => {
        let o = this.status[plugin.directory] = {
          revs: {},
          stat: 'updating'
        }
        return this.updatePlug(plugin).then(() => {
          o.stat = 'success'
        }, err => {
          this.appendLog(plugin.directory, 'Error: ' + err.message)
          o.stat = 'fail'
        })
      }
    })
    this.updating = true
    const start = Date.now()
    util.queue(fns, this.threads).then(() => {
      clearInterval(interval)
      this.updating = false
      this.ellipse = Date.now() - start
      this.updateView(buf)
      this.updateRemotePlugins()
    }, err => {
      clearInterval(interval)
      this.updating = false
      this.showErrorMsg(err.message)
      process.exit(1)
    })
  }
  private updateView(bufnr): void {
    let lines = []
    let dirs = Object.keys(this.status)
    let total = this.total
    let arr = []
    let stats = (new Array(total)).fill(' ')
    dirs.sort((a, b) => b > a ? 1 : -1)
    dirs.forEach((dir, i) => {
      let o = this.status[dir]
      let buf = ''
      switch (o.stat) {
        case 'installing':
          stats[i] = '+'
          buf += '+ '
          break
        case 'updating':
          stats[i] = '='
          buf += '* '
          break
        case 'success':
          stats[i] = 'o'
          buf += '✓ '
          break
        case 'fail':
          stats[i] = 'x'
          buf += '✗ '
          break
      }
      buf += path.basename(dir)
      if (o.branch) buf += ' [' + o.branch + ']'
      buf += ':'
      if (o.revs.to) {
        if (!o.revs.from) {
          buf += ' Installed'
        } else if (o.revs.from == o.revs.to) {
          buf += ' Already up-to-date.'
        } else {
          buf += ` Updated [${o.revs.from.slice(0, 8)} - ${o.revs.to.slice(0, 8)}]`
        }
      } else {
        let msgs = this.logs[dir]
        if (msgs && msgs.length) buf = buf + ' ' + msgs[msgs.length - 1]
      }
      arr.push(buf)
    })
    if (!this.updating) {
      let success = stats.filter(o => o == 'o').length
      let fail = stats.filter(o => o == 'x').length
      lines.push('Cost:' + this.ellipse / 1000 + 's Success:' + success + ' Fail:' + fail)
    } else {
      const completed = dirs.filter(dir => {
        let o = this.status[dir]
        return o.stat == 'success' || o.stat == 'fail'
      })
      lines.unshift(`Install/Updating plugins ${completed.length}/${total}`)
    }
    if (total > 1) lines.push('[' + stats.join('') + ']')
    lines.push('r -> retry | d -> diff | l -> log | t -> item tab | q -> quit')
    lines = lines.concat(arr.reverse())
    let buf = this.nvim.createBuffer(bufnr)
    buf.setLines(lines, {
      start: 0,
      end: -1,
      strictIndexing: false
    }).catch(_err => {
      // noop
    })
  }
  public async updatePlug(plugin): Promise<void> {
    const { directory, name } = plugin
    let file = path.resolve(__dirname, '../log', name + '.log')
    fs.unlink(file, () => { })
    let isDirectory = await util.isDirectory(directory)
    let o = this.status[plugin.directory]
    o.revs = {}
    if (isDirectory) {
      o.stat = 'updating'
      await this.pull(plugin)
    } else {
      o.stat = 'installing'
      await this.clone(plugin)
    }
  }
  private showErrorMsg(msg): void {
    this.nvim.command(`echoerr '${msg.replace(/'/g, "''")}'`, true)
  }
  public async install(buf, repo): Promise<void> {
    let name = repo.replace(/^[^/]+\//, '')
    this.plugins = [{
      name,
      directory: path.join(process.env.HOME, `.vim/bundle/${name}`),
      remote: `https://github.com/${repo}.git`,
      dest: 'master',
      frozen: 0,
      do: ''
    }]
    await this.update(buf, name, false)
  }
  public async update(buf, name, isRetry = false): Promise<void> {
    if (this.updating) {
      this.showErrorMsg('Plugin update in process')
      return
    }
    if (!isRetry) {
      this.status = {}
      this.logs = {}
      this.total = 1
    }
    let interval = setInterval(() => {
      this.updateView(buf)
    }, 200)
    this.updating = true
    const start = Date.now()
    let plugin = this.plugins.find(plugin => plugin.name == name)
    if (!plugin) {
      this.showErrorMsg(`Plugin ${name} not found`)
      return
    }
    let o = this.status[plugin.directory] = {
      revs: {},
      stat: 'updating'
    }
    try {
      await this.updatePlug(plugin)
      o.stat = 'success'
      this.updating = false
      this.ellipse = Date.now() - start
    } catch (err) {
      this.showErrorMsg(`Update error on ${plugin.name}: ${err.message}`)
      o.stat = 'fail'
      this.ellipse = Date.now() - start
      this.updating = false
      this.updateView(buf)
      clearInterval(interval)
    }
    this.updateRemotePlugins()
    this.updateView(buf)
    clearInterval(interval)
  }
  public async clone(plugin): Promise<void> {
    const { remote, name, directory, dest } = plugin
    const cmd = plugin['do']
    const stat = this.status[directory]
    const cwd = path.dirname(plugin.directory)
    const args = ['clone', remote, name, '--progress', '--recursive']
    if (this.shadow) args.push('--depth=1', '--shallow-submodules')
    this.appendLog(directory, 'cd ' + cwd)
    this.appendLog(directory, 'git ' + args.join(' '))
    let { timeout } = this
    try {
      await util.proc(spawn('git', args, { cwd }), timeout, line => {
        this.appendLog(directory, line)
      })
      if (cmd) {
        this.appendLog(directory, `Run command: ${cmd}`)
        let stdout = await util.execute(cmd, directory)
        stdout.split(/\n/).forEach(line => {
          this.appendLog(directory, line)
        })
      }
      if (dest) {
        this.appendLog(directory, `Checkout: ${dest}`)
        let stdout = await util.execute(`git checkout ${dest}`, directory)
        stdout.split(/\n/).forEach(line => {
          this.appendLog(directory, line)
        })
      }
      stat.revs.to = await util.getRevs(directory)
      stat.branch = await util.getBranch(directory)
      await this.updateSubmodule(directory, 'init')
    } catch (e) {
      this.appendLog(directory, e.message)
    }
  }
  public pull(plugin): Promise<void> {
    const { remote, directory, dest } = plugin
    const cmd = plugin['do']
    const stat = this.status[directory]
    const args = ['pull', remote, '--progress', '--stat']
    if (this.useRebase) args.push('--rebase', '--autostash')
    this.appendLog(directory, 'cd ' + directory)
    this.appendLog(directory, 'git ' + args.join(' '))
    const s = new Serial()
    s.timeout(60000)
    s.add(cb => {
      util.getRevs(directory).then(rev => {
        stat.revs.from = rev
        cb()
      }, cb)
    })
    s.add(cb => {
      const proc = spawn('git', args, { cwd: directory })
      util.proc(proc, this.timeout, line => {
        this.appendLog(directory, line)
      }).then(cb, cb)
    })
    s.add(cb => {
      if (!dest) return cb()
      const proc = spawn('git', ['checkout', dest], { cwd: directory })
      util.proc(proc, this.timeout, line => {
        this.appendLog(directory, line)
      }).then(cb, cb)
    })
    s.add(cb => {
      util.getBranch(directory).then(branch => {
        stat.branch = branch
        cb()
      })
    })
    s.add(cb => {
      util.getRevs(directory).then(rev => {
        stat.revs.to = rev
        cb()
      }, cb)
    })
    s.add(cb => {
      this.updateSubmodule(directory, 'update').then(cb, cb)
    })
    s.add(cb => {
      if (!cmd) return cb()
      let { from, to } = stat.revs
      if (from == to) return cb()
      this.appendLog(directory, cmd)
      util.execute(cmd, directory).then(stdout => {
        stdout.split(/\n/).forEach(line => {
          this.appendLog(directory, line)
        })
        cb()
      }, cb)
    })
    return new Promise((resolve, reject) => {
      s.done(err => {
        if (err) return reject(err)
        resolve()
      })
    })
  }
  private appendLog(dir: string, line: string): void {
    if (/^\s*$/.test(line)) return
    let list = this.logs[dir] || []
    list.push(line)
    this.logs[dir] = list
    let name = path.basename(dir)
    let file = path.resolve(__dirname, '../log', name + '.log')
    fs.appendFileSync(file, line + '\n', 'utf8')
  }
  public showLog(buf: number, name: string): void {
    let plugin = this.plugins.find(o => o.name == name)
    if (!plugin) {
      this.showErrorMsg(`Plugin ${name} not found`)
      return
    }
    let file = path.resolve(__dirname, `../log/${name}.log`)
    let content = fs.readFileSync(file, 'utf8')
    let lines = content.split('\n')
    let buffer = this.nvim.createBuffer(buf)
    buffer.setLines(lines, {
      start: 0,
      end: -1,
      strictIndexing: false
    })
  }
  public diff(buf, name): void {
    let plugin = this.plugins.find(o => o.name == name)
    if (!plugin) {
      this.showErrorMsg(`Plugin ${name} not found`)
      return
    }
    let o = this.status[plugin.directory]
    if (!o || !o.revs.to) return
    let msgs = []
    let revs = o.revs
    exec(`git --no-pager diff --no-color ${revs.from} ${revs.to}`, {
      cwd: plugin.directory
    }, (err, stdout) => {
      if (err) {
        msgs.push('Error: ' + err.message)
      } else {
        msgs = stdout.split(/\r?\n/)
      }
      let buffer = this.nvim.createBuffer(buf)
      buffer.setLines(msgs, {
        start: 0,
        end: -1,
        strictIndexing: false
      })
    })
  }
  private updateSubmodule(directory: string, method: string): Promise<void> {
    return new Promise(resolve => {
      fs.exists(path.join(directory, '.gitmodules'), exists => {
        if (!exists) return resolve()
        let proc = spawn('git', ['submodule', method], { cwd: directory })
        util.proc(proc, this.timeout, line => {
          this.appendLog(directory, line)
        }).then(resolve, () => {
          resolve()
        })
      })
    })
  }
}
