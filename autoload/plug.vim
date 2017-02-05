let g:plug_shadow = get(g:, 'plug_shadow', 1)
let g:plug_threads = get(g:, 'plug_threads', 8)
let g:plug_timeout = get(g:, 'plug_timeout', 60)
let g:plug_window = get(g:, 'plug_window', '10 split')
let g:plug_rebase = get(g:, 'plug_rebase', 0)
let g:plug_url_format = get(g:, 'plug_url_format', 'git@github.com:%s.git')

let s:plug_root = ''

let s:plug_plugins = []
let s:plug_after_plugins = []
let s:plug_loaded = 0
let s:is_win = has("win32") || has('win64')

let s:job_opts = {'rpc': v:true}
let s:script = expand('<sfile>:h:h').'/src/plug.js'
let s:on_load = []
let s:std_err = {}
let s:saved_pvh = &previewheight

command! -nargs=* -bar Plug :call plug#add(<args>)

function! plug#plugins() abort
  return s:plug_plugins
endfunction

function! plug#add(name, ...) abort
  if s:plug_loaded | return | endif
  let opts = get(a:, 1, {})
  let name = get(opts, 'as', matchstr(a:name, '[^\/]\+$'))
  let root = get(opts, 'dir', s:plug_root)
  let remote = printf(g:plug_url_format, a:name)

  let item = {
      \ 'name': name,
      \ 'directory': root.'/'.name,
      \ 'remote': remote,
      \ 'frozen': get(opts, 'frozen', 0),
      \ 'do': get(opts, 'do', ''),
      \}
  call add(s:plug_plugins, item)
  let after = root.'/'.name.'/after'
  if isdirectory(after)
    call add(s:plug_after_plugins, after)
  endif
endfunction

" check all plugin directory
"function! plug#check()
"  let succ = 1
"  for dir in s:plug_plugins
"    if !isdirectory(dir)
"      let succ = 0 echohl Error | echon dir.' not a directory!' | echohl None endif
"  endfor
"  if succ | echo 'ok' | endif
"endfunction

function! plug#clean()
  if empty(s:plug_root)
    echoerr '[plug.nvim] plug root not found'
    return
  endif
  let plug_dirs = map(copy(s:plug_plugins), "v:val['directory']")
  let dirs = split(glob(s:plug_root.'/*'), "\n")
  let rm_cmd = get(g:, 'plug_clean_command', 0)
  for dir in dirs
    if isdirectory(dir) && index(plug_dirs, dir) == -1
      if input('Remove directory '.dir.'? [y/n]') =~ 'y'
        if rm_cmd
          call system(rm_cmd.' '.shellescape(dir))
        else
          call s:rm_rf(dir)
        endif
      endif
    endif
  endfor
endfunction

function! plug#begin(...)
  let s:plug_root = get(a:, 1, s:home().'/bundle')
  if !isdirectory(s:plug_root)
    call mkdir(s:plug_root, 'p', 0700)
  endif
  let paths = split(&runtimepath, ",")
  let find = 0
  for p in paths
    if p =~# 'plug\.nvim$'
      let find = 1
      call add(s:plug_plugins, {
            \ 'name': 'plug.nvim',
            \ 'directory': p,
            \ 'remote': 'https://github.com/chemzqm/plug.nvim.git',
            \ 'frozen': 0,
            \ 'do': ''
            \})
    endif
  endfor
  if find == 0
    echoerr '[plug.nvim] plug.nvim not found in runtimepath'
  endif
endfunction

function! s:home()
  if s:is_win
    return $VIM."/vimfiles"
  endif
  return $HOME."/.vim"
endfunction

function! s:rm_rf(dir)
  if isdirectory(a:dir)
    call system((s:is_win ? 'rmdir /S /Q ' : 'rm -rf ') . shellescape(a:dir))
  endif
endfunction

function! plug#end()
  if s:plug_loaded | return | endif
  let prepends = join(map(copy(s:plug_plugins), 'v:val.directory'), ',')
  let appends = join(s:plug_after_plugins, ',')
  let g:a = appends
  exec 'set rtp^='.fnameescape(prepends)
  exec 'set rtp+='.fnameescape(appends)
  let s:plug_loaded = 1
endfunction

function! s:job_opts.on_stderr(chan_id, data, event) dict
  let data = get(s:std_err, a:chan_id, [])
  call extend(data, a:data)
  let s:std_err[a:chan_id] = data
endfunction

function! s:job_opts.on_exit(chan_id, code, event) dict
  let g:plug_nvim_channel_id = 0
  let g:plug_nvim_node_channel = 0
  if a:code != 0
    echoerr '[plug.nvim] child process abnormal exited with code '.a:code
    let msgs = get(s:std_err, a:chan_id, [])
    echohl Error | echomsg '[plug.nvim] ' . join(msgs, "\n") | echohl None
    return
  endif
endfunction

function! s:ChannelStatChanged(d, k, z)
  if empty(a:z['new']) | return | endif
  echom '[plug.nvim] attached'
  for dict in s:on_load
    call dict.callback()
  endfor
  let s:on_load = []
endfunction

if !has('nvim') | finish | endif

" added from node
call dictwatcheradd(g:, 'plug_nvim_node_channel', function('s:ChannelStatChanged'))

function! plug#start()
  if !executable('node')
    echoerr '[plug.nvim] node not installed, please install latest node from https://nodejs.org'
    return
  endif
  if get(g:, 'plug_nvim_channel_id', 0)
    return
  endif
  let args = ['node', s:script]
  let channel_id = jobstart(args, s:job_opts)
  if channel_id <= 0
    echoerr '[plug.nvim] failed to start channel_id:'.channel_id
    return
  endif
  let g:plug_nvim_channel_id = channel_id
endfunction

" update all plugins
function! plug#update(...)
  let dict = {}
  let dict.name = get(a:, 1, '')
  function! dict.callback() dict
    call s:Update(self.name)
  endfunction
  if get(g:, 'plug_nvim_node_channel', 0)
    call dict.callback()
  else
    call plug#start()
    call add(s:on_load, dict)
  endif
endfunction

function! s:Update(name)
  exe 'keepalt '.g:plug_window.' plug://'.localtime()
  let nr = bufnr('%')
  wincmd p
  call rpcnotify(g:plug_nvim_node_channel, 'update', nr, a:name)
endfunction

function! plug#diff(name)
  let nr = s:OpenPreview('diff', a:name)
  let wnr = bufwinnr(nr)
  exe wnr . "wincmd w"
  call rpcnotify(g:plug_nvim_node_channel, 'diff', nr, a:name)
endfunction

function! plug#log(plug)
  let nr = s:OpenPreview('log', a:plug)
  call rpcnotify(g:plug_nvim_node_channel, 'log', nr, a:plug)
endfunction

function! s:OpenPreview(type, plug)
  let bnr = s:FindPreview()
  if bnr && bufname(bnr) !~# '^plug://'
    pclose
    let bnr = 0
  endif
  if !bnr
    let s:saved_pvh = &previewheight
  endif
  exe 'vert pedit plug://'.a:type.'_'.a:plug
  let cw = winwidth(0)
  wincmd p
  let target_width = (cw + winwidth(0))/2
  let bnr = bufnr('%')
  execute 'wincmd p | vert resize '.target_width
  call setbufvar(bnr, 'saved_pvh', s:saved_pvh)
  return bnr
endfunction

function! s:FindPreview()
  for wnr in range(1, winnr('$'))
    let bnr = winbufnr(wnr)
    if getbufvar(bnr, '&previewwindow')
      return bnr
    endif
  endfor
endfunction
