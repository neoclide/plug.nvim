import { exec, ChildProcess } from 'child_process'
import fs from 'fs'
import path from 'path'
import { PromisedFn } from './types'

export function getRevs(directory: string): Promise<string> {
  return new Promise(resolve => {
    exec('git rev-parse --verify HEAD', { cwd: directory }, (err, stdout) => {
      if (err) return resolve('')
      resolve(stdout.replace(/\r?\n$/, ''))
    })
  })
}

export function getBranch(directory: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec('git symbolic-ref -q HEAD',
      { cwd: directory }, (err, stdout) => {
        if (err) return reject(err)
        let str = stdout.replace('\n', '').slice(11)
        if (str) return resolve(str)
        exec('git rev-parse --short HEAD | cut -c 2-',
          { cwd: directory },
          (err, stdout) => {
            if (err) return reject(err)
            resolve(stdout.replace(/\n$/, ''))
          })
      })
  })
}

export function execute(cmd, cwd): Promise<string> {
  return new Promise(resolve => {
    exec(cmd, { cwd }, (err, stdout) => {
      if (err) return resolve('')
      stdout = stdout || ''
      resolve(stdout.replace(/\r?\n$/, '\n'))
    })
  })
}

export function queue(fns: PromisedFn[], count: number): Promise<void> {
  return new Promise((resolve, reject) => {
    let a = fns.slice(0, count)
    let b = fns.slice(count)
    let l = fns.length
    let runs = 0
    if (fns.length == 0) return resolve()
    for (let fn of a) {
      fn().then(() => {
        runs += 1
        if (runs == l) return resolve()
        let next = () => {
          let fn = b.shift()
          if (!fn) return
          return fn().then(() => {
            runs += 1
            if (runs == l) return resolve()
            return next()
          }, reject)
        }
        return next()
      }, reject)
    }
  })
}

export function proc(process: ChildProcess, timeout: number, onupdate: (line: string) => void): Promise<void> {
  let out = false
  process.stdout.setEncoding('utf8')
  function onData(data): void {
    if (out) return
    let str = data.toString()
    let lines: string[] = str.split(/\r?\n/)
    lines.forEach(line => {
      if (line.trim() == '') return
      if (/\r/.test(line)) {
        let arr = line.split(/\r/)
        onupdate(arr.reverse()[0].replace(/\s+$/, ''))
      } else {
        onupdate(line.replace(/\s+$/, ''))
      }
    })
  }
  process.stderr.on('data', onData)
  process.stdout.on('data', onData)
  return new Promise((resolve, reject) => {
    let t = setTimeout(() => {
      out = true
      process.kill('SIGKILL')
    }, timeout * 1000)
    process.on('error', err => {
      reject(err)
    })
    process.on('exit', code => {
      if (out) reject(new Error('Process timeout after ' + timeout + 's'))
      clearTimeout(t)
      if (code == 0) {
        setTimeout(() => {
          resolve()
        }, 100)
      } else {
        reject(new Error('process exit with ' + code))
      }
    })
  })
}

export function isDirectory(dir: string): Promise<boolean> {
  return new Promise(resolve => {
    fs.stat(dir, (err, stat) => {
      if (err || !stat.isDirectory()) return resolve(false)
      resolve(true)
    })
  })
}

export function isRemote(dir: string): Promise<boolean> {
  return isDirectory(path.join(dir, 'rplugin'))
}
