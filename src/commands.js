const spawn = require('child_process').spawn
const exec = require('child_process').exec
const path = require('path')
const util = require('./util')
const semver = require('semver')
const Parallel = require('node-parallel')
const Serial = require('node-serial')
const fs = require('fs')

export default class Commands {
  constructor(nvim, config) {
    this.nvim = nvim
    this.config = config
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
        this.nvim.command(`let g:plug_updating=${val ? 1 : 0}`).catch(err => {
          console.error(err)
        })
      }
    })
  }
  updateRemotePlugins() {
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
          if (res) this.nvim.command(`helptags ${docRoot}`).catch(() => {})
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
        this.nvim.command('UpdateRemotePlugins').catch(() => {})
      }
    })
  }
  updateAll(buf) {
    this.status = {}
    this.logs = {}
    if (this.updating) {
      this.showErrorMsg('Plugin update in process')
      return
    }
    let interval = setInterval(() => {
      this.updateView(buf)
    }, 200)
    let self = this
    let plugins = this.plugins.filter(o => !o.frozen)
    this.total = plugins.length
    let fns = plugins.map(plugin => {
      return function () {
        let o = self.status[plugin.directory] = {}
        o.revs = []
        o.stat = 'updating'
        return self.updatePlug(plugin).then(() => {
          o.stat = 'success'
        }, err => {
          self.appendLog(plugin.directory, 'Error: ' + err.message)
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
  updateView(bufnr) {
    let lines = []
    let dirs = Object.keys(this.status)
    let total = this.total
    let arr = []
    let stats = (new Array(total)).fill(' ')
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
          buf += ` Updated [${o.revs.from.slice(0,8)} - ${o.revs.to.slice(0,8)}]`
        }
      } else {
        let msgs = this.logs[dir]
        if (msgs && msgs.length) buf = buf + ' ' + msgs[msgs.length - 1]
      }
      arr.push(buf)
    })
    arr.sort((a, b) => {
      if (/:\s(Installed|Updated)/.test(a)) return 1
      if (/:\s(Installed|Updated)/.test(b)) return -1
      return 0
    })
    if (!this.updating) {
      let success = stats.filter(o => o == 'o').length
      let fail = stats.filter(o => o == 'x').length
      lines.push('Cost:' + this.ellipse/1000 + 's Success:' + success + ' Fail:' + fail)
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
    this.nvim.request('nvim_buf_set_lines', [bufnr, 0, lines.length, false, lines]).catch(err => {
      console.error(err.message)
    })
  }
  updatePlug(plugin) {
    const {directory, name} = plugin
    let file = path.resolve(__dirname, '../log', name + '.log')
    fs.unlink(file, () => { })
    return util.isDirectory(directory).then(res => {
      let o = this.status[plugin.directory]
      o.revs = {}
      if (res) {
        o.stat = 'updating'
        return this.pull(plugin)
      }
      o.method = 'installing'
      return this.clone(plugin)
    })
  }
  showErrorMsg(msg) {
    this.nvim.command(`echoerr '${msg}'`).catch(() => {})
  }
  update(buf, name, isRetry) {
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
    let o = this.status[plugin.directory] = {}
    this.updatePlug(plugin).then(() => {
      o.stat = 'success'
      this.updating = false
      this.ellipse = Date.now() - start
      this.updateRemotePlugins()
      this.updateView(buf)
      clearInterval(interval)
    }, err => {
      this.showErrorMsg(`Update error on ${plugin.name}: ${err.message}`)
      o.stat = 'fail'
      this.updating = false
      clearInterval(interval)
    })
  }
  clone(plugin) {
    const {remote, name, directory, dest} = plugin
    const cmd = plugin['do']
    const stat = this.status[directory]
    const cwd = path.dirname(plugin.directory)
    const args = ['clone', remote, name, '--progress', '--recursive']
    if (this.shadow) args.push('--depth=1', '--shallow-submodules')
    this.appendLog(directory, 'cd ' + cwd)
    this.appendLog(directory, 'git ' + args.join(' '))
    return util.proc(spawn('git', args, {cwd: cwd}), this.timeout, line => {
      this.appendLog(directory, line)
    }).then(() => {
      if (cmd) {
        this.appendLog(directory, cmd)
        return util.exec(cmd, directory).then(stdout => {
          stdout.split(/\n/).forEach(line => {
            this.appendLog(directory, line)
          })
        })
      }
    }).then(() => {
      if (dest) {
        return util.proc(spawn('git', ['checkout', dest], {cwd: cwd}, this.timeout, line => {
          this.appendLog(directory, line)
        }))
      }
    }).then(() => {
      return util.getRevs(directory).then(rev => {
        stat.revs.to = rev
      })
    }).then(() => {
      return util.getBranch(directory).then(branch => {
        stat.branch = branch
      })
    }).then(() => {
      return new Promise((resolve, reject) => {
        this.updateSubmodule(directory, 'init', err => {
          if (err) return reject(err)
          resolve()
        })
      })
    })
  }
  pull(plugin) {
    const {remote, directory, dest} = plugin
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
      const proc = spawn('git', args, {cwd: directory})
      util.proc(proc, this.timeout, line => {
        this.appendLog(directory, line)
      }).then(cb, cb)
    })
    s.add(cb => {
      if (!dest) return cb()
      const proc = spawn('git', ['checkout', dest], {cwd: directory})
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
      this.updateSubmodule(directory, 'update', cb)
    })
    s.add(cb => {
      if (!cmd) return cb()
      let {from, to} = stat.revs
      if (from == to) return cb()
      this.appendLog(directory, cmd)
      util.exec(cmd, directory).then(stdout => {
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
  appendLog(dir, line) {
    if (/^\s*$/.test(line)) return
    let list = this.logs[dir] || []
    list.push(line)
    this.logs[dir] = list
    let name = path.basename(dir)
    let file = path.resolve(__dirname, '../log', name + '.log')
    fs.appendFile(file, line + '\n', 'utf8', err => {
      if (err) {
        console.error(err)
      }
    })
  }
  showLog(buf, name) {
    let plugin = this.plugins.find(o => {
      return path.basename(o.directory) == name
    })
    if (!plugin) {
      this.showErrorMsg(`Plugin ${name} not found`)
      return
    }
    let file = path.resolve(__dirname, '../log', name + '.log')
    exec(`cat ${file}`, (err, stdout) => {
      if (err) return console.error(err)
      let lines = stdout.split('\n')
      this.nvim.request('nvim_buf_set_lines', [buf, 0, lines.length, false, lines]).catch(err => {
        console.error(err.message)
      })
    })
  }
  diff(buf, name) {
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
      this.nvim.request('nvim_buf_set_lines', [buf, 0, msgs.length, false, msgs]).catch(err => {
        console.error(err.message)
      })
    })
  }
  updateSubmodule(directory, method, cb) {
    fs.access(path.join(directory, '.gitmodules'), fs.W_OK, err => {
      if (err) return cb()
      let proc = spawn('git', ['submodule', method], {cwd: directory})
      util.proc(proc, this.timeout, line => {
        this.appendLog(directory, line)
      }).then(cb, cb)
    })
  }
}
