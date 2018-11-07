if exists('did_plug_vim_loaded')
  finish
endif
let did_plug_vim_loaded = 1
let g:plug_shadow = get(g:, 'plug_shadow', 1)
let g:plug_threads = get(g:, 'plug_threads', 8)
let g:plug_timeout = get(g:, 'plug_timeout', 30)
let g:plug_rebase = get(g:, 'plug_rebase', 0)
let g:plug_url_format = get(g:, 'plug_url_format', 'https://github.com/%s.git')

let s:plug_root = ''
let s:plug_plugins = []
let s:plug_after_plugins = []
let s:plug_loaded = 0
let s:is_win = has("win32") || has('win64')
let s:saved_pvh = &previewheight
let s:root = expand('<sfile>:h:h')
let s:failed = 0
let s:job_opts = {}

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
  let dest = get(opts, 'branch', get(opts, 'tag', get(opts, 'commit', '')))
  let item = {
      \ 'name': name,
      \ 'directory': root.'/'.name,
      \ 'remote': remote,
      \ 'dest': dest,
      \ 'frozen': get(opts, 'frozen', 0),
      \ 'do': get(opts, 'do', ''),
      \}
  call add(s:plug_plugins, item)
  let after = root.'/'.name.'/after'
  if isdirectory(after)
    call add(s:plug_after_plugins, after)
  endif
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
            \ 'remote': 'https://github.com/neoclide/plug.nvim.git',
            \ 'frozen': 0,
            \ 'do': ''
            \})
    endif
  endfor
  if empty(find)
    echoerr '[plug.nvim] plug.nvim not found in runtimepath'
  endif
endfunction

function! plug#end()
  if s:plug_loaded | return | endif
  let prepends = join(map(copy(s:plug_plugins), 'v:val.directory'), ',')
  let appends = join(s:plug_after_plugins, ',')
  exec 'set rtp^='.fnameescape(prepends)
  exec 'set rtp+='.fnameescape(appends)
  let s:plug_loaded = 1
endfunction

function! plug#open_preview(type, plug)
  let bnr = s:FindPreview()
  if bnr && bufname(bnr) !~# '^plug://'
    pclose
    let bnr = 0
  endif
  if !bnr
    let s:saved_pvh = &previewheight
  endif
  exe 'pedit plug://'.a:type.'_'.a:plug
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

function! s:home()
  if s:is_win
    return $VIM."/vimfiles"
  endif
  return $HOME."/.vim"
endfunction

function! plug#start_server()
  let cmd = ['node', s:root . '/bin/server.js']
  let cid = jobstart(cmd, s:job_opts)
  if cid <= 0
    echohl Error | echom '[plug.nvim] Failed to start service' | echohl None
    let s:failed = 1
    return
  endif
endfunction

function! s:job_opts.on_stderr(chan_id, data, event) dict
  for msg in a:data
    if !empty(msg)
      echohl Error | echom msg | echohl None
    endif
  endfor
endfunction

function! s:job_opts.on_stdout(chan_id, data, event) dict
  for msg in a:data
    if !empty(msg)
      echom msg
    endif
  endfor
endfunction

function! s:job_opts.on_exit(chan_id, code, event) dict
  let g:plug_channel_id = 0
  if v:dying != 0 | return | endif
  if a:code != 0
    let s:failed = 1
    echohl Error | echomsg '[plug.nvim] Abnormal exited' | echohl None
  endif
endfunction

function! plug#notify(method, ...) abort
  let channel = get(g:, 'plug_channel_id', 0)
  if channel
    call call('rpcnotify', [channel, a:method] + a:000)
  else
    let s:failed = 0
    call plug#start_server()
    let n = 0
    while 1
      sleep 200m
      let n = n + 1
      if s:failed | return | endif
      if n == 10
        echohl Error | echom '[plug.nvim] Server start timeout after 2s.' | echohl None
        return
      endif
      let channel = get(g:, 'plug_channel_id', 0)
      if channel
        call call('rpcnotify', [channel, a:method] + a:000)
        return
      endif
    endw
  endif
endfunction
