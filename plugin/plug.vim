if !has('nvim') | finish | endif
if exists('did_plug_loaded')
  finish
endif
let did_plug_loaded = 1

command! -nargs=?  -complete=custom,s:ListPlugins PlugUpdate :call plug#update(<f-args>)
command! -nargs=0 PlugClean :call plug#clean()

function! s:SetDisplayView()
  setlocal filetype=plug
  setlocal buftype=nofile
  setlocal bufhidden=wipe
  setlocal noswapfile
  setlocal nobuflisted
  setlocal scrolloff=0
  exe 'nnoremap <buffer> <silent> D  :call <SID>ShowDiff()<cr>'
  exe 'nnoremap <buffer> <silent> gl :call <SID>ShowGitLog()<cr>'
  exe 'nnoremap <buffer> <silent> L  :call <SID>ShowLog()<cr>'
  exe 'nnoremap <buffer> <silent> q  :quit<cr>'
  call s:syntax()
endfunction

function! s:ListPlugins(...)
  let plugins = map(copy(plug#plugins()), "get(v:val, 'name', 'wtf')")
  return join(plugins, "\n")
endfunction

function! s:ShowGitLog()
  let name = s:Getname()
  if empty(name) | return | endif
  for plug in plug#plugins()
    if plug.name == name
      exec 'lcd '.plug.directory
      exec 'Unite gitlog:all'
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
  syn match plugName /\(^✓ \)\@<=[^ ]*:/
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

function! s:ShowDiff()
  let name = s:Getname()
  if empty(name) | return | endif
  call plug#diff(name)
endfunction

function! s:ShowLog()
  let name = s:Getname()
  if empty(name) | return | endif
  call plug#log(name)
endfunction

function! s:Getname()
  let line = getline('.')
  let ms = matchlist(line, '\v^.\s([^:]+)')
  if len(ms)
    return ms[1]
  endif
  return ''
endfunction

function! s:ResetPreview(buf)
  let height = getbufvar(a:buf, 'saved_pvh')
  if height
    exe 'set pvh='.height
  endif
endfunction

augroup plug
  autocmd!
  autocmd VimEnter * if get(g:, 'plug_nvim_autoload', 1) == 0 | call plug#start() | endif
  autocmd BufNewFile plug://[0-9]*  :call s:SetDisplayView()
  autocmd BufNewFile plug://diff_*  :call s:SetDiffView()
  autocmd BufNewFile plug://log_*   :call s:SetLogView()
  autocmd BufWinLeave plug://diff_* :call s:ResetPreview(+expand('<abuf>'))
  autocmd BufWinLeave plug://log_* :call s:ResetPreview(+expand('<abuf>'))
augroup end
