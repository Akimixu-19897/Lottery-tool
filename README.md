# Lottery Tool（转盘抽奖）

桌面端转盘抽奖小工具（Windows / macOS），基于 Tauri + Vue3。

## 转盘组件

- 使用 `@lucky-canvas/vue` 的 `LuckyWheel`

## 功能

- 导入人员名单（Excel）
- 导入奖品名单（Excel），不导入则默认：一等奖/二等奖/三等奖/四等奖（可在界面里改数量）
- 转盘抽奖（每次抽 1 人，绑定“当前奖品”，抽中后该奖品剩余 -1）
- 导出中奖名单（Excel：姓名、奖品、时间）

## Excel 格式约定

- 人员名单：取第一个工作表的第一列（可带表头）
- 奖品名单：取第一个工作表前两列（奖品、数量；数量可省略，默认 1；可带表头）

## 开发

```bash
npm install
npm run tauri:dev
```

## 打包

```bash
npm run tauri:build
```
