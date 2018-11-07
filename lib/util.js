"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const child_process_1 = require("child_process");
const fs_1 = tslib_1.__importDefault(require("fs"));
const path_1 = tslib_1.__importDefault(require("path"));
function getRevs(directory) {
    return new Promise(resolve => {
        child_process_1.exec('git rev-parse --verify HEAD', { cwd: directory }, (err, stdout) => {
            if (err)
                return resolve('');
            resolve(stdout.replace(/\r?\n$/, ''));
        });
    });
}
exports.getRevs = getRevs;
function getBranch(directory) {
    return new Promise((resolve, reject) => {
        child_process_1.exec('git symbolic-ref -q HEAD', { cwd: directory }, (err, stdout) => {
            if (err)
                return reject(err);
            let str = stdout.replace('\n', '').slice(11);
            if (str)
                return resolve(str);
            child_process_1.exec('git rev-parse --short HEAD | cut -c 2-', { cwd: directory }, (err, stdout) => {
                if (err)
                    return reject(err);
                resolve(stdout.replace(/\n$/, ''));
            });
        });
    });
}
exports.getBranch = getBranch;
function execute(cmd, cwd) {
    return new Promise(resolve => {
        child_process_1.exec(cmd, { cwd }, (err, stdout) => {
            if (err)
                return resolve('');
            stdout = stdout || '';
            resolve(stdout.replace(/\r?\n$/, '\n'));
        });
    });
}
exports.execute = execute;
function queue(fns, count) {
    return new Promise((resolve, reject) => {
        let a = fns.slice(0, count);
        let b = fns.slice(count);
        let l = fns.length;
        let runs = 0;
        if (fns.length == 0)
            return resolve();
        for (let fn of a) {
            fn().then(() => {
                runs += 1;
                if (runs == l)
                    return resolve();
                let next = () => {
                    let fn = b.shift();
                    if (!fn)
                        return;
                    return fn().then(() => {
                        runs += 1;
                        if (runs == l)
                            return resolve();
                        return next();
                    }, reject);
                };
                return next();
            }, reject);
        }
    });
}
exports.queue = queue;
function proc(process, timeout, onupdate) {
    let out = false;
    process.stdout.setEncoding('utf8');
    function onData(data) {
        if (out)
            return;
        let str = data.toString();
        let lines = str.split(/\r?\n/);
        lines.forEach(line => {
            if (line.trim() == '')
                return;
            if (/\r/.test(line)) {
                let arr = line.split(/\r/);
                onupdate(arr.reverse()[0].replace(/\s+$/, ''));
            }
            else {
                onupdate(line.replace(/\s+$/, ''));
            }
        });
    }
    process.stderr.on('data', onData);
    process.stdout.on('data', onData);
    return new Promise((resolve, reject) => {
        let t = setTimeout(() => {
            out = true;
            process.kill('SIGKILL');
        }, timeout * 1000);
        process.on('error', err => {
            reject(err);
        });
        process.on('exit', code => {
            if (out)
                reject(new Error('Process timeout after ' + timeout + 's'));
            clearTimeout(t);
            if (code == 0) {
                setTimeout(() => {
                    resolve();
                }, 100);
            }
            else {
                reject(new Error('process exit with ' + code));
            }
        });
    });
}
exports.proc = proc;
function isDirectory(dir) {
    return new Promise(resolve => {
        fs_1.default.stat(dir, (err, stat) => {
            if (err || !stat.isDirectory())
                return resolve(false);
            resolve(true);
        });
    });
}
exports.isDirectory = isDirectory;
function isRemote(dir) {
    return isDirectory(path_1.default.join(dir, 'rplugin'));
}
exports.isRemote = isRemote;
//# sourceMappingURL=util.js.map