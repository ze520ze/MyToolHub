param(
    [string]$Version = "1.0.0",
    [switch]$SkipFrontendBuild
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Write-Step([string]$text) {
    Write-Host ""
    Write-Host "== $text ==" -ForegroundColor Cyan
}

function Invoke-Checked([string]$file, [string[]]$arguments, [string]$workdir) {
    Push-Location $workdir
    try {
        & $file @arguments
        if ($LASTEXITCODE -ne 0) {
            throw "命令执行失败（退出码 $LASTEXITCODE）：$file $($arguments -join ' ')"
        }
    }
    finally {
        Pop-Location
    }
}

function Write-Utf8([string]$path, [string]$text, [bool]$withBom) {
    $encoding = New-Object System.Text.UTF8Encoding($withBom)
    [System.IO.File]::WriteAllText($path, $text, $encoding)
}

Write-Host "MyToolHub Windows 单文件打包" -ForegroundColor Cyan
Write-Host "项目目录：$root"

Write-Step "检查打包环境"
$node = (Get-Command node.exe -ErrorAction Stop).Source
$pnpm = (Get-Command pnpm.cmd -ErrorAction Stop).Source
$npm = (Get-Command npm.cmd -ErrorAction Stop).Source
$csc = Join-Path $env:WINDIR "Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path $csc)) {
    throw "找不到 C# 编译器：$csc（需要 Windows 自带的 .NET Framework 4.x）"
}
Write-Host "node：$node"
Write-Host "pnpm：$pnpm"
Write-Host "csc ：$csc"

$packageDir = Join-Path $root ".build\package"
$appDir = Join-Path $packageDir "app"
$backendStage = Join-Path $appDir "backend"
$sharedJs = Join-Path $root ".build\shared-js"
$backendJs = Join-Path $root ".build\backend-js"
$payloadZip = Join-Path $packageDir "payload.zip"
$releaseDir = Join-Path $root "release"
$launcherDir = Join-Path $root "packaging\launcher"
$iconPath = Join-Path $launcherDir "app.ico"
$exePath = Join-Path $releaseDir "MyToolHub.exe"

if (-not (Test-Path $iconPath)) {
    throw "缺少启动器图标：$iconPath"
}

Write-Step "清理上一次打包产物"
if (Test-Path $packageDir) {
    Remove-Item -Recurse -Force $packageDir
}
if (Test-Path $sharedJs) {
    Remove-Item -Recurse -Force $sharedJs
}
if (Test-Path $backendJs) {
    Remove-Item -Recurse -Force $backendJs
}
New-Item -ItemType Directory -Force -Path $packageDir | Out-Null
New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null

if ($SkipFrontendBuild) {
    Write-Step "跳过前端构建"
}
else {
    Write-Step "构建前端（Vue + Vite）"
    Invoke-Checked $pnpm @("--filter", "@mytoolhub/frontend", "build") $root
}

if (-not (Test-Path (Join-Path $root "packages\frontend\dist\index.html"))) {
    throw "前端构建产物不存在：packages\frontend\dist\index.html"
}

Write-Step "编译共享类型与后端（Node ESM）"
Invoke-Checked $node @(".\node_modules\typescript\bin\tsc", "-p", "tsconfig.package.json", "--noCheck") (Join-Path $root "packages\shared")
Invoke-Checked $node @(".\node_modules\typescript\bin\tsc", "-p", "tsconfig.package.json", "--noCheck") (Join-Path $root "packages\backend")

Write-Step "组装后端运行时"
New-Item -ItemType Directory -Force -Path (Join-Path $backendStage "dist") | Out-Null
Copy-Item -Path (Join-Path $backendJs "*") -Destination (Join-Path $backendStage "dist") -Recurse -Force

$sourcePkg = Get-Content (Join-Path $root "packages\backend\package.json") -Raw -Encoding UTF8 | ConvertFrom-Json
$prodDeps = [ordered]@{}
foreach ($prop in $sourcePkg.dependencies.PSObject.Properties) {
    if ($prop.Name -ne "@mytoolhub/shared") {
        $prodDeps[$prop.Name] = $prop.Value
    }
}
$stagePkg = [ordered]@{
    name         = $sourcePkg.name
    version      = $sourcePkg.version
    private      = $true
    type         = $sourcePkg.type
    scripts      = @{}
    dependencies = $prodDeps
}
$stagePkgJson = $stagePkg | ConvertTo-Json -Depth 10
Write-Utf8 (Join-Path $backendStage "package.json") $stagePkgJson $false

Write-Host "安装后端生产依赖（npm --omit=dev）..."
Invoke-Checked $npm @("install", "--omit=dev", "--no-audit", "--no-fund", "--registry=https://registry.npmmirror.com") $backendStage

$sharedTarget = Join-Path $backendStage "node_modules\@mytoolhub\shared"
$sharedDist = Join-Path $sharedTarget "dist"
New-Item -ItemType Directory -Force -Path $sharedDist | Out-Null
Copy-Item -Path (Join-Path $sharedJs "*") -Destination $sharedDist -Recurse -Force
$sharedPkg = [ordered]@{
    name    = "@mytoolhub/shared"
    version = "1.0.0"
    private = $true
    type    = "module"
    main    = "./dist/index.js"
    exports = @{ "." = "./dist/index.js" }
}
Write-Utf8 (Join-Path $sharedTarget "package.json") ($sharedPkg | ConvertTo-Json -Depth 10) $false

$sqliteBinary = Join-Path $backendStage "node_modules\better-sqlite3\build\Release\better_sqlite3.node"
if (-not (Test-Path $sqliteBinary)) {
    throw "better-sqlite3 原生模块缺失：$sqliteBinary"
}

Write-Step "复制前端、Node 运行时与许可证"
$frontendTarget = Join-Path $appDir "frontend"
New-Item -ItemType Directory -Force -Path $frontendTarget | Out-Null
Copy-Item -Path (Join-Path $root "packages\frontend\dist") -Destination (Join-Path $frontendTarget "dist") -Recurse -Force

$nodeDir = Join-Path $appDir "node"
New-Item -ItemType Directory -Force -Path $nodeDir | Out-Null
Copy-Item -Path $node -Destination (Join-Path $nodeDir "node.exe") -Force
$nodeLicense = Join-Path (Split-Path $node -Parent) "LICENSE"
if (Test-Path $nodeLicense) {
    Copy-Item -Path $nodeLicense -Destination (Join-Path $nodeDir "LICENSE") -Force
}
$nodeVersion = & $node --version
$nodeReadme = "Node.js 运行时（随 MyToolHub 分发）" + [Environment]::NewLine + "版本：" + $nodeVersion + [Environment]::NewLine + "许可证：https://nodejs.org/en/about/previous-releases" + [Environment]::NewLine
Write-Utf8 (Join-Path $nodeDir "README.txt") $nodeReadme $true

Write-Step "生成内置程序包"
if (Test-Path $payloadZip) {
    Remove-Item -Force $payloadZip
}
Compress-Archive -Path (Join-Path $appDir "*") -DestinationPath $payloadZip -CompressionLevel Optimal
$payloadHash = (Get-FileHash -Algorithm SHA256 $payloadZip).Hash.ToLowerInvariant()
$payloadId = "v$Version-" + $payloadHash.Substring(0, 12)
Write-Host "payload：$payloadZip"
Write-Host ("payload 大小：{0:N1} MB，ID：{1}" -f ((Get-Item $payloadZip).Length / 1MB), $payloadId)

Write-Step "生成启动器版本信息"
$buildInfo = @"
namespace MyToolHubLauncher
{
    internal static class BuildInfo
    {
        public const string Version = "$Version";
        public const string PayloadId = "$payloadId";
    }
}
"@
Write-Utf8 (Join-Path $launcherDir "BuildInfo.cs") $buildInfo $false

Write-Step "编译单文件启动器"
if (Test-Path $exePath) {
    Remove-Item -Force $exePath
}
$resourceArg = '/resource:"' + $payloadZip + '",MyToolHub.Payload.zip'
$cscArgs = @(
    "/nologo",
    "/target:winexe",
    "/platform:anycpu",
    "/optimize+",
    "/win32icon:$iconPath",
    "/out:$exePath",
    "/r:System.dll",
    "/r:System.Core.dll",
    "/r:System.Drawing.dll",
    "/r:System.Windows.Forms.dll",
    "/r:System.IO.Compression.dll",
    "/r:System.IO.Compression.FileSystem.dll",
    $resourceArg,
    "Program.cs",
    "BuildInfo.cs",
    "AssemblyInfo.cs"
)
Invoke-Checked $csc $cscArgs $launcherDir

Write-Step "写入使用说明"
$releaseReadme = @"
MyToolHub 个人工具集（Windows 便携版）
========================================

启动
----
双击 MyToolHub.exe。

首次启动会把内置程序解压到：
  %LOCALAPPDATA%\MyToolHub\app-<版本ID>
之后启动会直接复用，不会重复解压。

启动完成后：
  - 浏览器会以独立窗口打开 MyToolHub。
  - 系统托盘会出现 MyToolHub 图标。
  - 右键托盘图标可以重新打开、复制局域网地址、打开数据目录、查看日志或退出。

数据与备份
----------
数据库文件：
  %LOCALAPPDATA%\MyToolHub\data\toolhub.db

运行日志：
  %LOCALAPPDATA%\MyToolHub\logs\

备份时退出程序，复制 data 目录即可。删除 data 目录会清空所有分组和接口配置。

端口
----
默认从 3000 开始，如果被占用会自动尝试 3001、3002……实际端口写在：
  %LOCALAPPDATA%\MyToolHub\port.txt

系统要求
--------
Windows 10/11 64 位；已安装 Microsoft Edge 或 Google Chrome（用于显示界面）。
不需要单独安装 Node.js。

升级与卸载
----------
升级：退出程序后，用新的 MyToolHub.exe 覆盖旧文件即可，数据会保留。
卸载：退出程序，删除 MyToolHub.exe 和 %LOCALAPPDATA%\MyToolHub 目录。

局域网访问
----------
在托盘菜单选择“复制局域网访问地址”，手机与电脑连接同一局域网后即可访问。
Windows 防火墙首次可能询问是否允许 Node.js 联网，请选择允许（专用网络）。
"@
Write-Utf8 (Join-Path $releaseDir "使用说明.txt") $releaseReadme $true

Write-Step "打包完成"
$exeInfo = Get-Item $exePath
$exeHash = (Get-FileHash -Algorithm SHA256 $exePath).Hash
Write-Host ("输出文件：{0}" -f $exeInfo.FullName) -ForegroundColor Green
Write-Host ("文件大小：{0:N1} MB" -f ($exeInfo.Length / 1MB))
Write-Host ("SHA256  ：{0}" -f $exeHash)
Write-Host ("payload ：{0}" -f $payloadId)
Write-Host ""
Write-Host "测试建议：先退出正在运行的 MyToolHub，再双击 release\MyToolHub.exe。" -ForegroundColor Yellow
