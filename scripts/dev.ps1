#requires -Version 5.1
<#
  MyToolHub 一键启动开发环境
  用法：
    powershell -ExecutionPolicy Bypass -File .\scripts\dev.ps1
#>
[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
if (-not $pnpm) {
  Write-Host '未找到 pnpm，请先安装 pnpm 8.x 或运行 .\scripts\setup.ps1。' -ForegroundColor Red
  exit 1
}

$nodeModules = Join-Path $root 'node_modules'
if (-not (Test-Path $nodeModules)) {
  Write-Host '未找到 node_modules，先执行 pnpm install ...' -ForegroundColor Yellow
  & pnpm install
  if ($LASTEXITCODE -ne 0) {
    Write-Host '依赖安装失败，已停止启动。' -ForegroundColor Red
    exit $LASTEXITCODE
  }
}

Write-Host ''
Write-Host '== 启动 MyToolHub 开发环境 ==' -ForegroundColor Cyan
Write-Host '前端: http://localhost:5173'
Write-Host '后端: http://localhost:3000'
Write-Host '按 Ctrl+C 停止。'
Write-Host ''

& pnpm dev
exit $LASTEXITCODE
