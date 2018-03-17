# ============================================================================
# FILE: project.py
# AUTHOR: Qiming Zhao <chemzqm@gmail.com>
# License: MIT license
# ============================================================================
# pylint: disable=E0401,C0411
import os
from .base import Base
from ..kind.base import Base as BaseKind
from operator import itemgetter

class Source(Base):

    def __init__(self, vim):
        super().__init__(vim)

        self.name = 'vim'
        self.kind = Kind(vim)
        self.sorters = []

    def on_init(self, context):
        context['__plugins'] = self.vim.call('plug#plugins')

    def highlight(self):
        self.vim.command('highlight link deniteSource__VimName Directory')
        self.vim.command('highlight link deniteSource__VimDirectory Comment')

    def define_syntax(self):
        self.vim.command(r'syntax match deniteSource__VimHeader /^.*$/ '
                         r'containedin=' + self.syntax_name)
        self.vim.command(r'syntax match deniteSource__VimName /^.*\%22c/ contained '
                         r'contained containedin=deniteSource__VimHeader')
        self.vim.command(r'syntax match deniteSource__VimDirectory /\%23c.*$/ contained '
                         r'contained containedin=deniteSource__VimHeader')

    def gather_candidates(self, context):
        homepath = os.path.expanduser('~')
        candidates = []
        for plug in context['__plugins']:
            mtime = os.stat(plug['directory']).st_mtime
            candidates.append({
                'word': plug['name'],
                'abbr': '%-20s %-26s' % (plug['name'], plug['directory'].replace(homepath, '~')),
                'source__directory': plug['directory'],
                'source__mtime': mtime
                })
        candidates = sorted(candidates, key=itemgetter('source__mtime'),
                            reverse=True)
        return candidates

class Kind(BaseKind):
    def __init__(self, vim):
        super().__init__(vim)

        self.default_action = 'tabopen'
        self.name = 'project'

    def action_tabopen(self, context):
        target = context['targets'][0]
        self.vim.call('denite#extra#iterm_tabopen', target['source__directory'])

    def action_update(self, context):
        target = context['targets'][0]
        self.vim.command('PlugUpdate %s' % target['word'])

    def action_delete(self, context):
        for item in context['targets']:
            self.vim.command('PlugRemove %s' % item['word'])
