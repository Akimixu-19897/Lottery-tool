import * as XLSX from 'xlsx'
import type { DrawResult, Prize } from './models'
import { createId, defaultPrizes } from './models'

function normalizeCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function guessHeaderRow(firstRow: unknown[]): boolean {
  const a = normalizeCell(firstRow[0]).toLowerCase()
  const b = normalizeCell(firstRow[1]).toLowerCase()
  const maybeName = ['姓名', '名字', 'name', '人员', '员工']
  const maybePrize = ['奖品', '奖项', 'prize', 'level', '奖']
  const maybeCount = ['数量', '份数', 'count', 'qty', 'num', 'number']
  return (
    maybeName.some((k) => a.includes(k)) ||
    maybePrize.some((k) => a.includes(k)) ||
    maybeCount.some((k) => b.includes(k))
  )
}

function parsePeopleSheet(sheet: XLSX.WorkSheet): string[] {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true }) as unknown[][]
  if (!rows.length) return []

  const start = guessHeaderRow(rows[0] ?? []) ? 1 : 0
  const names = rows
    .slice(start)
    .map((r) => normalizeCell(r?.[0]))
    .filter(Boolean)

  return [...new Set(names)]
}

function parsePrizesSheet(sheet: XLSX.WorkSheet): Prize[] {
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true }) as unknown[][]
  if (!rows.length) return []

  const start = guessHeaderRow(rows[0] ?? []) ? 1 : 0
  const items = rows
    .slice(start)
    .map((r) => {
      const name = normalizeCell(r?.[0])
      const qtyRaw = normalizeCell(r?.[1])
      const total = qtyRaw ? Number.parseInt(qtyRaw, 10) : 1
      return { name, total: Number.isFinite(total) && total > 0 ? total : 1 }
    })
    .filter((x) => x.name)

  return items.map((x) => ({ id: createId(), name: x.name, total: x.total, remaining: x.total }))
}

export function parsePeopleExcel(bytes: Uint8Array | ArrayBuffer): string[] {
  const workbook = XLSX.read(bytes, { type: 'array' })
  const firstSheetName = workbook.SheetNames[0]
  if (!firstSheetName) return []
  const sheet = workbook.Sheets[firstSheetName]
  if (!sheet) return []
  return parsePeopleSheet(sheet)
}

export function parsePrizesExcel(bytes: Uint8Array | ArrayBuffer): Prize[] {
  const workbook = XLSX.read(bytes, { type: 'array' })
  const firstSheetName = workbook.SheetNames[0]
  if (!firstSheetName) return []
  const sheet = workbook.Sheets[firstSheetName]
  if (!sheet) return []
  return parsePrizesSheet(sheet)
}

// 兼容“sheet1=人员，sheet2=奖品”，一次性读取同一个 Excel。
export function parsePeopleAndPrizesExcel(bytes: Uint8Array | ArrayBuffer): { peopleNames: string[]; prizes: Prize[] } {
  const workbook = XLSX.read(bytes, { type: 'array' })
  const sheet1Name = workbook.SheetNames[0]
  const sheet2Name = workbook.SheetNames[1]

  const sheet1 = sheet1Name ? workbook.Sheets[sheet1Name] : undefined
  const sheet2 = sheet2Name ? workbook.Sheets[sheet2Name] : undefined

  const peopleNames = sheet1 ? parsePeopleSheet(sheet1) : []
  const prizes = sheet2 ? parsePrizesSheet(sheet2) : defaultPrizes()
  return { peopleNames, prizes }
}

export function buildResultsXlsx(results: DrawResult[]): Uint8Array {
  const sheet = XLSX.utils.json_to_sheet(
    results.map((r, idx) => ({
      序号: idx + 1,
      姓名: r.personName,
      奖品: r.prizeName,
      时间: r.timestamp,
    })),
  )
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, '中奖名单')

  const arrayBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
  return new Uint8Array(arrayBuffer)
}
