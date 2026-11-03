#requires -Version 5.1
<#
  MyToolHub 环境检查与依赖安装（可选脚本）
  用法：
    powershell -ExecutionPolicy Bypass -File .\scripts\setup.ps1
    powershell -ExecutionPolicy Bypass -File .\scripts\setup.ps1 -SkipInstall
#>
[CmdletBinding()]
param(
  [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host ''
Write-Host '== MyToolHub 环境检查 ==' -ForegroundColor Cyan
Write-Host "项目目录: $root"
Write-Host ''

$ok = $true

function Test-RequiredCommand {
  param(
    [string]$Name,
    [string]$VersionArgs,
    [string]$Hint
  )

  $command = Get-Command $Name -ErrorAction SilentlyContinue
  if (-not $command) {
    Write-Host "[缺失] $Name" -ForegroundColor Red
    Write-Host "       $Hint"
    return $null
  }

  $version = & $Name $VersionArgs 2>$null
  if ($LASTEXITCODE -ne 0 -or -not $version) {
    Write-Host "[异常] $Name 无法执行" -ForegroundColor Red
    Write-Host "       请重新安装或检查 PATH。"
    return $null
  }

  Write-Host "[正常] $Name $($version.Trim())" -ForegroundColor Green
  return $version.Trim()
}

$nodeVersion = Test-RequiredCommand -Name 'node' -VersionArgs '-v' -Hint '请安装 Node.js 20 LTS 或以上，并勾选 Add to PATH。'
if ($nodeVersion) {
  $nodeMajor = 0
  $majorText = $nodeVersion.TrimStart('v').Split('.')[0]
  if (-not [int]::TryParse($majorText, [ref]$nodeMajor) -or $nodeMajor -lt 20) {
    Write-Host "[版本过低] Node.js $nodeVersion，需要 20 或以上。" -ForegroundColor Red
    $ok = $false
  }
} else {
  $ok = $false
}

$npmVersion = Test-RequiredCommand -Name 'npm' -VersionArgs '-v' -Hint 'npm 通常随 Node.js 一起安装，请检查 Node.js 安装。'
if (-not $npmVersion) {
  $ok = $false
}

$pnpmVersion = Test-RequiredCommand -Name 'pnpm' -VersionArgs '-v' -Hint '请执行: corepack enable; corepack prepare pnpm@8.15.9 --activate'
if (-not $pnpmVersion) {
  $ok = $false
} else {
  $pnpmMajor = 0
  $pnpmMajorText = ($pnpmVersion -split '\.')[0]
  if ([int]::TryParse($pnpmMajorText, [ref]$pnpmMajor) -and $pnpmMajor -lt 8) {
    Write-Host "[版本过低] pnpm $pnpmVersion，建议使用 8.x。" -ForegroundColor Yellow
    Write-Host "       可执行: corepack prepare pnpm@8.15.9 --activate"
  }
}

# Git 用于版本管理；不影响项目运行，缺失时只提示
$gitCommand = Get-Command git -ErrorAction SilentlyContinue
if ($gitCommand) {
  $gitVersion = (& git --version 2>$null)
  Write-Host "[正常] $gitVersion" -ForegroundColor Green
} else {
  Write-Host '[提示] 未找到 git（可选，不影响项目启动）。' -ForegroundColor Yellow
}

if (-not $ok) {
  Write-Host ''
  Write-Host '环境检查未通过，请先处理上面的缺失项。' -ForegroundColor Red
  exit 1
}

if ($SkipInstall) {
  Write-Host ''
  Write-Host '已跳过依赖安装（-SkipInstall）。' -ForegroundColor Yellow
  exit 0
}

Write-Host ''
Write-Host '== 安装项目依赖 ==' -ForegroundColor Cyan
Write-Host '正在执行 pnpm install ...'
& pnpm install
if ($LASTEXITCODE -ne 0) {
  Write-Host ''
  Write-Host '依赖安装失败，请检查网络或上方错误信息。' -ForegroundColor Red
  exit $LASTEXITCODE
}

Write-Host ''
Write-Host '依赖安装完成。' -ForegroundColor Green
Write-Host '下一步：pnpm dev（或运行 .\scripts\dev.ps1）'
Write-Host '前端地址: http://localhost:5173'
Write-Host '后端地址: http://localhost:3000'
Write-Host ''
