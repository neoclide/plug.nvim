# Plug.nvim

None block plugin manager using neovim job-control feature.

## Features

* Async and run git commands in parallel
* Quick remap for view update logs and diffs
* High performance for speedup (no remote host)
* Run `UpdateRemotePlugins` command and generate helptags when necessary
* No cache, no magic

## Install

[Node.js](https://nodejs.org/en/) is required, after node installed, run command
like:

```
git clone https://github.com/chemzqm/plug.nvim.git ~/.vim/bundle
cd ~/.vim/bundle/plug.nvim
npm install
```

## Usage

``` viml
" change runtimepath is required
set runtimepath^=~/.vim/bundle/plug.nvim
call plug#begin()
Plug 'chemzqm/wxapp.vim', {'dir': '~/vim-dev', 'frozen': 1}
Plug 'Shougo/echodoc.vim'
" should only be used after all plugins added by Plug command
call plug#end()

filetype plugin indent on
syntax on
```
## Variables

* `g:plug_shadow`: use shadow clone(--depth=1) for git repos, set to `0` to disable it
* `g:plug_threads`: the number of parallel threads for update/install, default to `8`
* `g:plug_timeout`: timeout in seconds of each update/install command, default to `60`
* `g:plug_window`: edit command for plug window, default to `10 split`
* `g:plug_rebase`: use rebase (git pull --rebase --autostash) for update, default to `0`
* `g:plug_url_format`: format string for git remote location, default: `git@github.com:%s.git`
* `g:plug_clean_command`: custom command for remove directory by `PlugClean`, default is `rm -rf` (or `rmdir` on windows)

## Keymaps

* `q` quit current buffer
* `L` show update/install log in preview window
* `D` show latest update diff in preview window
* `gl` run `Unite gitlog` in plugin directory, requires [unite-git-log](https://github.com/chemzqm/unite-git-log)

## Functions

### `plug#begin([root])`

A function that should be called before any Plug command.
You can specify a optional `root` directory for all your plugins, it's default
to `$VIM."/vimfiles/bundle"` on windows and `~/.vim/bundle` on Mac/Linux.

### `plug#end()`

A function that should be called after all Plug command.

## Commands

### `Plug 'user/repo', option`

Plug.nvim only support install plugins from **github**.

`option` is a viml dictionary, it could contains following: 

* `dir` custom parent directory for this plugin
* `frozen` not run update or install for this plugin when is `1`
* `do` command that would be run in plugin folder after install/update
* `as` specify an alias name for plugin folder to avoid conflict

**Notice** no lazyload stuff would be available, it's useless for neovim.

### `PlugUpdate`

Update/install all plugins.

### `PlugUpdate [name]`

Update/install a specific plugin, use `tab` to complete name.

### `PlugClean`

Helper command for clean unused plugin inside the root directory, prompt is used
before actually remove the directory

## LICENSE

Copyright 2017 chemzqm@gmail.com

Permission is hereby granted, free of charge, to any person obtaining
a copy of this software and associated documentation files (the "Software"),
to deal in the Software without restriction, including without limitation
the rights to use, copy, modify, merge, publish, distribute, sublicense,
and/or sell copies of the Software, and to permit persons to whom the
Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included
in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE
OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
