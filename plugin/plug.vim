if !has('nvim') | finish | endif
if exists('did_plug_loaded')
  finish
endif
let did_plug_loaded = 1

function! s:SetDisplayView()
  setl filetype=plug buftype=nofile noswapfile scrolloff=0 wrap
  exe 'nnoremap <buffer> <silent> gl :call <SID>ShowGitLog()<cr>'
  exe 'nnoremap <buffer> <silent> r  :call <SID>DoAction("retry")<cr>'
  exe 'nnoremap <buffer> <silent> d  :call <SID>DoAction("diff")<cr>'
  exe 'nnoremap <buffer> <silent> l  :call <SID>DoAction("log")<cr>'
  exe 'nnoremap <buffer> <silent> t  :call <SID>OpenItermTab()<cr>'
  exe 'nnoremap <buffer> <silent> q  :call <SID>SmartQuit()<cr>'
  call s:syntax()
endfunction

function! s:SmartQuit()
  bdelete!
endfunction

function! s:ListPlugins(...)
  let plugins = map(copy(plug#plugins()), "get(v:val, 'name', '')")
  return join(plugins, "\n")
endfunction

function! s:ShowGitLog()
  let name = s:Getname()
  if empty(name) | return | endif
  for plug in plug#plugins()
    if plug.name == name
      exec 'lcd '.plug.directory
      exec 'Denite gitlog:all'
    endif
  endfor
endfunction 

function! s:syntax()
  syntax clear
  syntax region plug1 start=/\%1l/ end=/\%2l/ contains=plugNumber
  syntax region plug2 start=/\%2l/ end=/\%3l/ contains=plugBracket,plugX,plugOk,plugEq
  syn match plugBracket /[[\]]/ contained
  syn match plugNumber /[0-9]\+[0-9.]*/ contained
  syn match plugX /x/ contained
  syn match plugOk /o/ contained
  syn match plugEq /=/ contained
  syn match plugStar /^*/
  syn match plugSuccess /^✓/
  syn match plugFail /^✗/
  syn match plugName /\(^\(✓\|✗\) \)\@<=[^ ]*:/
  syn match plugInstall /\(^+ \)\@<=[^:]*/
  syn match plugUpdate /\(^* \)\@<=[^:]*/
  hi def link plug1       Title
  hi def link plugNumber  Number
  hi def link plugX       Exception
  hi def link plugBracket Operator
  hi def link plugEq      Operator
  hi def link plugOk      String
  hi def link plugStar    Operator
  hi def link plugSuccess String
  hi def link plugFail    Exception
  hi def link plugName    Label
  hi def link plugInstall Function
  hi def link plugUpdate  Type
endfunction

function! s:SetDiffView()
  exe 'nnoremap <buffer> <silent> q :quit<cr>'
  setlocal filetype=git buftype=nofile foldmethod=syntax bufhidden=wipe nofen
  if exists('*easygit#foldtext')
    setlocal foldtext=easygit#foldtext()
  endif
endfunction

function! s:SetLogView()
  setlocal filetype=log buftype=nofile nobuflisted bufhidden=wipe
  exe 'nnoremap <buffer> <silent> q :quit<cr>'
endfunction

function! s:DoAction(type)
  let name = s:Getname()
  if empty(name) | return | endif
  if a:type ==# 'retry'
    call plug#notify('retry', name)
    return
  endif
  let bufnr = plug#open_preview(a:type, name)
  if a:type ==# 'diff'
    call plug#notify('diff', bufnr, name)
  elseif a:type ==# 'log'
    call plug#notify('log', bufnr, name)
  endif
endfunction

function! s:Getname()
  let line = getline('.')
  let ms = matchlist(line, '\v^.\s(\S+)')
  if len(ms)
    return substitute(ms[1], ':$', '', '')
  endif
  return ''
endfunction

function! Getname()
  let line = getline('.')
  let ms = matchlist(line, '\v^.\s(\S+)')
  if len(ms)
    return substitute(ms[1], ':$', '', '')
  endif
  return ''
endfunction

function! s:ResetPreview(buf)
  let height = getbufvar(a:buf, 'saved_pvh')
  if height
    exe 'set pvh='.height
  endif
endfunction

function! s:OpenItermTab()
  let name = s:Getname()
  if empty(name) | return | endif
  for plug in plug#plugins()
    if plug.name == name
      call s:osascript(
          \ 'tell application "iTerm2"',
          \   'tell current window',
          \     'create tab with default profile',
          \     'tell current session',
          \       'delay 0.1',
          \       'write text "cd '.s:escape(plug.directory).'"',
          \       'write text "clear"',
          \     'end tell',
          \   'end tell',
          \ 'end tell')
    endif
  endfor
endfunction

function! s:escape(filepath)
  return "'".substitute(a:filepath, "'", "\\'", 'g')."'"
endfunction

function! s:osascript(...) abort
  let args = join(map(copy(a:000), '" -e ".shellescape(v:val)'), '')
  let output = system('osascript'. args)
  if v:shell_error && output !=# ""
    echohl Error | echon output | echohl None
    return
  endif
endfunction

command! -nargs=?  -complete=custom,s:ListPlugins PlugUpdate :call plug#notify('update', <f-args>)
command! -nargs=1  -complete=custom,s:ListPlugins PlugRemove :call plug#notify('remove', <f-args>)
command! -nargs=0  PlugCheck :call plug#notify('check')
command! -nargs=1  -complete=custom,s:ListPlugins PlugInstall :call plug#notify('install', <f-args>)

augroup plug
  autocmd!
  autocmd BufNewFile plug://[0-9]*  :call s:SetDisplayView()
  autocmd BufNewFile plug://diff_*  :call s:SetDiffView()
  autocmd BufNewFile plug://log_*   :call s:SetLogView()
  autocmd BufWinLeave plug://diff_* :call s:ResetPreview(+expand('<abuf>'))
  autocmd BufWinLeave plug://log_* :call s:ResetPreview(+expand('<abuf>'))
augroup end
