# scripts

这里放的是可选的 Windows 辅助脚本，不参与应用运行。

## setup.ps1

检查 Node.js、npm、pnpm、Git，并执行 `pnpm install`。

    powershell -ExecutionPolicy Bypass -File .\scripts\setup.ps1

只检查环境、不安装依赖：

    powershell -ExecutionPolicy Bypass -File .\scripts\setup.ps1 -SkipInstall

脚本不会自动安装 Node.js 或 pnpm，避免覆盖机器上已有环境；缺失时会打印安装提示。

## dev.ps1

检查依赖目录后启动 `pnpm dev`，同时运行前端和后端。

    powershell -ExecutionPolicy Bypass -File .\scripts\dev.ps1

启动后访问：

- 前端：http://localhost:5173
- 后端：http://localhost:3000

也可以直接使用根目录命令，效果相同：

    pnpm install
    pnpm dev

## package-win.ps1

构建前端、编译后端、收集生产依赖并内置 Node.js，打包成 Windows 单文件 EXE：

    powershell -ExecutionPolicy Bypass -File .\scripts\package-win.ps1

或者使用根目录命令：

    pnpm package:win

输出：

- release\MyToolHub.exe
- release\使用说明.txt

只重新编译后端/启动器、跳过前端构建：

    powershell -ExecutionPolicy Bypass -File .\scripts\package-win.ps1 -SkipFrontendBuild

需要系统已安装 .NET Framework 4.x（Windows 10/11 自带 csc.exe）。打包脚本只在 Windows 上可用。
