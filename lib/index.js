'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = undefined;

var _dec, _dec2, _dec3, _dec4, _dec5, _dec6, _dec7, _dec8, _class, _desc, _value, _class2;

var _neovim = require('neovim');

var _commands = require('./commands');

var _commands2 = _interopRequireDefault(_commands);

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _applyDecoratedDescriptor(target, property, decorators, descriptor, context) {
  var desc = {};
  Object['ke' + 'ys'](descriptor).forEach(function (key) {
    desc[key] = descriptor[key];
  });
  desc.enumerable = !!desc.enumerable;
  desc.configurable = !!desc.configurable;

  if ('value' in desc || desc.initializer) {
    desc.writable = true;
  }

  desc = decorators.slice().reverse().reduce(function (desc, decorator) {
    return decorator(target, property, desc) || desc;
  }, desc);

  if (context && desc.initializer !== void 0) {
    desc.value = desc.initializer ? desc.initializer.call(context) : void 0;
    desc.initializer = undefined;
  }

  if (desc.initializer === void 0) {
    Object['define' + 'Property'](target, property, desc);
    desc = null;
  }

  return desc;
}

const trash = require('trash');
const pify = require('pify');
const exec = require('child_process').exec;
let opts = {};
let command = null;

let Plug = (_dec = (0, _neovim.Plugin)({ dev: !!process.env.NVIM_NODE_HOST_DEBUG }), _dec2 = (0, _neovim.Function)('PlugUpdate', { sync: false }), _dec3 = (0, _neovim.Function)('PlugRetry', { sync: false }), _dec4 = (0, _neovim.Command)('PlugCheck', {
  sync: true
}), _dec5 = (0, _neovim.Command)('PlugInstall', {
  sync: false,
  nargs: 1
}), _dec6 = (0, _neovim.Function)('PlugRemove', { sync: false }), _dec7 = (0, _neovim.Function)('PlugDiff', { sync: false }), _dec8 = (0, _neovim.Function)('PlugLog', { sync: false }), _dec(_class = (_class2 = class Plug {

  async initCommand() {
    opts.threads = await this.nvim.getVar('plug_threads');
    opts.timeout = await this.nvim.getVar('plug_timeout');
    opts.shadow = await this.nvim.getVar('plug_shadow');
    opts.rebase = await this.nvim.getVar('plug_rebase');
    opts.plugins = await this.nvim.call('plug#plugins', []);
    let output = await pify(exec)('git --version');
    opts.version = output.replace('git version', '').replace(/\n/g, '');
    command = new _commands2.default(this.nvim, opts);
  }

  async plugUpdate(args) {
    if (!command) {
      await this.initCommand();
    }
    await this.nvim.command('edit plug://' + Date.now());
    let nr = await this.nvim.eval('bufnr("%")');
    if (args.length == 0) {
      command.updateAll(nr);
    } else {
      command.update(nr, args[0]);
    }
  }

  async plugRetry(args) {
    let name = args[0];
    if (!name || !command) return;
    let nr = await this.nvim.eval('bufnr("%")');
    command.update(nr, name, true);
  }

  async plugCheck() {
    let plugins = await this.nvim.call('plug#plugins', []);
    for (let plug of plugins) {
      let stat = await pify(_fs2.default.stat)(plug.directory);
      if (!stat.isDirectory()) {
        await this.nvim.command(`echoerr '${plug.directory} not exists!'`);
      }
    }
  }

  async plugInstall(args) {
    if (!command) {
      await this.initCommand();
    }
    await this.nvim.command('edit plug://' + Date.now());
    let nr = await this.nvim.eval('bufnr("%")');
    command.install(nr, args[0]);
  }

  async plugRemove(args) {
    let name = args[0];
    let plugins = await this.nvim.call('plug#plugins', []);
    let plug = plugins.find(o => o.name == name);
    if (plug) {
      await trash(plug.directory);
      await this.nvim.command(`echom "Removed ${plug.directory}"`);
    }
  }

  async plugDiff(args) {
    command.diff(args[0], args[1]);
  }

  async plugLog(args) {
    command.showLog(args[0], args[1]);
  }
}, (_applyDecoratedDescriptor(_class2.prototype, 'plugUpdate', [_dec2], Object.getOwnPropertyDescriptor(_class2.prototype, 'plugUpdate'), _class2.prototype), _applyDecoratedDescriptor(_class2.prototype, 'plugRetry', [_dec3], Object.getOwnPropertyDescriptor(_class2.prototype, 'plugRetry'), _class2.prototype), _applyDecoratedDescriptor(_class2.prototype, 'plugCheck', [_dec4], Object.getOwnPropertyDescriptor(_class2.prototype, 'plugCheck'), _class2.prototype), _applyDecoratedDescriptor(_class2.prototype, 'plugInstall', [_dec5], Object.getOwnPropertyDescriptor(_class2.prototype, 'plugInstall'), _class2.prototype), _applyDecoratedDescriptor(_class2.prototype, 'plugRemove', [_dec6], Object.getOwnPropertyDescriptor(_class2.prototype, 'plugRemove'), _class2.prototype), _applyDecoratedDescriptor(_class2.prototype, 'plugDiff', [_dec7], Object.getOwnPropertyDescriptor(_class2.prototype, 'plugDiff'), _class2.prototype), _applyDecoratedDescriptor(_class2.prototype, 'plugLog', [_dec8], Object.getOwnPropertyDescriptor(_class2.prototype, 'plugLog'), _class2.prototype)), _class2)) || _class);
exports.default = Plug;


process.on('uncaughtException', function (err) {
  console.error('Caught exception: ' + err);
});