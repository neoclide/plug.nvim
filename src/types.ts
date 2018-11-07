
export type PromisedFn = () => Promise<void>

export interface Config {
  shadow: boolean
  threads: number
  timeout: number
  rebase: boolean
  version: string
  plugins: any[]
}

export interface Revs {
  from: string
  to: string
}

export interface Status {
  revs: Revs | any
  stat: string
  branch?: string
}

export interface Logs {
  [key: string]: string[]
}

export interface Plugin {
  remote: string
  name: string
  directory: string
  dest?: string
  do?: string
}
