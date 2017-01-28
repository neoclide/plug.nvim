const spawn = require('child_process').spawn
const exec = require('child_process').exec
const path = require('path')
const util = require('./util')
const semver = require('semver')
const Parallel = require('node-parallel')

class Commands {
  constructor(nvim, config) {
    this.nvim = nvim
    this.config = config
    this.status = {}
    this.logs = {}

    this.shadow = config.shadow
    this.threads = config.threads
    this.timeout = config.timeout
    this.plugins = config.plugins.filter(item => {
      return !item.frozen
    })

    this.useRebase = config.rebase && semver.gt(config.version, '2.9.0')
  }
  updateRemote() {
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
        util.isRemote(dir).then(res => {
          if (res) shouldUpdate = true
          done()
        }, done)
      })
    })
    p.done(() => {
      if (shouldUpdate) {
        this.nvim.command('UpdateRemotePlugins', () => {})
      }
    })
  }
  updateAll(buf) {
    this.status = {}
    this.logs = {}
    if (this.updating) {
      this.nvim.command('echoerr Plugin update in process')
      return
    }
    let interval = setInterval(() => {
      this.updateView(buf)
    }, 200)
    let self = this
    let fns = this.plugins.map(plugin => {
      return function () {
        let o = self.status[plugin.directory] = {}
        o.revs = []
        o.stat = 'updating'
        return self.updatePlug(plugin).then(() => {
          o.stat = 'success'
        }, err => {
          self.nvim.command(`echoerr Update error on ${plugin.name}` + err.message, () => { })
          o.stat = 'fail'
        })
      }
    })
    this.updating = true
    const start = Date.now()
    util.queue(fns, this.threads).then(() => {
      this.updating = false
      this.ellipse = Date.now() - start
      this.updateView(buf)
      this.updateRemote()
      clearInterval(interval)
    }, err => {
      this.updating = false
      self.nvim.command('echoerr ' + err.message, () => { })
      clearInterval(interval)
      process.exit(1)
    })
  }
  updateView(buf) {
    let lines = []
    let dirs = Object.keys(this.status)
    let total = this.plugins.length
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
      buf += path.basename(dir) + ':'
      if (o.revs.to) {
        if (!o.revs.from) {
          buf += ' Installed'
        } else if (o.revs.from == o.revs.to) {
          buf += ' No change'
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
      const succeed = dirs.filter(dir => {
        let o = this.status[dir]
        return o.stat == 'success'
      })
      lines.unshift(`Install/Updating plugins ${succeed.length}/${total}`)
    }
    lines.push('[' + stats.join('') + ']')
    lines.push('')
    lines = lines.concat(arr.reverse())
    this.nvim.bufSetLines(buf, 0, lines.length, false, lines, err => {
      if (err) {
        console.error(err.message)
        process.exit(1)
      }
    })
  }
  updatePlug(plugin) {
    const {directory} = plugin
    return util.isDirectory(directory).then(res => {
      let o = this.status[plugin.directory]
      o.revs = {}
      if (res) {
        o.stat = 'updating'
        return this.pull(plugin).catch(e => {
          this.nvim.command(`echoerr [nvim.plug] update error of ${plugin.name} ${e.message}`)
        })
      }
      o.method = 'installing'
      return this.clone(plugin).catch(e => {
        this.nvim.command(`echoerr [nvim.plug] install error of ${plugin.name} ${e.message}`)
      })
    })
  }
  update(buf, name) {
    this.status = {}
    this.logs = {}
    if (this.updating) {
      this.nvim.command('echoerr Plugin update in process')
      return
    }
    let interval = setInterval(() => {
      this.updateView(buf)
    }, 200)
    this.updating = true
    const start = Date.now()
    let plugin = this.plugins.find(plugin => plugin.name == name)
    if (!plugin) {
      this.nvim.command(`echoerr Plugin ${name} not found`)
      return
    }
    let o = this.status[plugin.directory] = {}
    this.updatePlug(plugin).then(() => {
      o.stat = 'success'
      this.updating = false
      this.ellipse = Date.now() - start
      this.updateView(buf)
      this.updateRemote()
      clearInterval(interval)
    }, err => {
      self.nvim.command(`echoerr Update error on ${plugin.name}` + err.message, () => { })
      o.stat = 'fail'
      this.updating = false
      clearInterval(interval)
    })
  }
  clone(plugin) {
    const {remote, name, directory} = plugin
    const cmd = plugin['do']
    const stat = this.status[directory]
    const cwd = path.dirname(plugin.directory)
    const args = ['clone', remote, name, '--progress', '--recursive']
    if (this.shadow) args.push('--depth=1', '--shallow-submodules')
    this.appendLog(directory, 'cd ' + cwd)
    this.appendLog(directory, 'git ' + args.join(' '))
    const process = spawn('git', args, {cwd: cwd})
    return util.proc(process, this.timeout, line => {
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
      return util.getRevs(directory).then(rev => {
        stat.revs.to = rev
      })
    })
  }
  pull(plugin) {
    const {remote, directory} = plugin
    const cmd = plugin['do']
    const stat = this.status[directory]
    const args = ['pull', remote, '--progress', '--stat']
    if (this.useRebase) args.push('--rebase', '--autostash')
    this.appendLog(directory, 'cd ' + directory)
    this.appendLog(directory, 'git ' + args.join(' '))
    return util.getRevs(directory).then(rev => {
      stat.revs.from = rev
      const proc = spawn('git', args, {cwd: directory})
      return util.proc(proc, this.timeout, line => {
        this.appendLog(directory, line)
      }).then(() => {
        return util.getRevs(directory).then(rev => {
          stat.revs.to = rev
        })
      }).then(() => {
        let revs = stat.revs
        this.appendLog(directory, cmd)
        if (cmd && revs.to !== revs.from) {
          return util.exec(cmd, directory).then(stdout => {
            stdout.split(/\n/).forEach(line => {
              this.appendLog(directory, line)
            })
          })
        }
      })
    })
  }
  appendLog(dir, line) {
    if (/^\s*$/.test(line)) return
    let list = this.logs[dir] || []
    list.push(line)
    this.logs[dir] = list
  }
  showLog(buf, name) {
    let plugin = this.plugins.find(o => {
      return path.basename(o.directory) == name
    })
    if (!plugin) {
      this.nvim.command(`echoerr Plugin ${name} not found`, () => { })
      return
    }
    let msgs = this.logs[plugin.directory]
    this.nvim.bufSetLines(buf, 0, msgs.length, false, msgs, err => {
      if (err) {
        console.error(err.message)
      }
    })
  }
  diff(buf, name) {
    let plugin = this.plugins.find(o => {
      return path.basename(o.directory) == name
    })
    if (!plugin) {
      this.nvim.command(`echoerr Plugin ${name} not found`, () => {
        this.nvim.command('pclose', () => {})
      })
      return
    }
    let o = this.status[plugin.directory]
    if (!o || !o.revs.to || o.revs.to == o.revs.from) {
      this.nvim.command(`echoerr no changes of ${name}`, () => {
        this.nvim.command('pclose', () => { })
      })
      return
    }
    this.nvim.command('lcd ' + plugin.directory, () => {})
    let msgs = []
    let revs = o.revs
    exec(`git --no-pager diff --no-color ${revs.from} ${revs.to}`, {
      cwd: plugin.directory
    }, (err, stdout) => {
      this.nvim.command(`let g:b="${buf || 'wtf'}"`, () => { })
      if (err) {
        msgs.push('Error: ' + err.message)
      } else {
        msgs = stdout.split(/\r?\n/)
      }
      this.nvim.bufSetLines(buf, 0, msgs.length, false, msgs, err => {
        if (err) {
          console.error(err.message)
        }
      })
    })
  }
}

module.exports = Commands
