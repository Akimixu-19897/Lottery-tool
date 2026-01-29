export type Person = {
  id: string
  name: string
  wins: number
}

export type Prize = {
  id: string
  name: string
  total: number
  remaining: number
}

export type DrawResult = {
  id: string
  personName: string
  prizeName: string
  timestamp: string
}

export function createId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `id_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

export function defaultPrizes(): Prize[] {
  return [
    { id: createId(), name: '一等奖', total: 1, remaining: 1 },
    { id: createId(), name: '二等奖', total: 1, remaining: 1 },
    { id: createId(), name: '三等奖', total: 1, remaining: 1 },
    { id: createId(), name: '四等奖', total: 1, remaining: 1 },
  ]
}
