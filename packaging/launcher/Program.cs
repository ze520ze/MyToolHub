using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.IO.Compression;
using System.Net;
using System.Net.Sockets;
using System.Reflection;
using System.Text;
using System.Threading;
using System.Windows.Forms;

namespace MyToolHubLauncher
{
    internal static class AppPaths
    {
        public static readonly string BaseDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "MyToolHub");

        public static readonly string AppDir = Path.Combine(BaseDir, "app-" + BuildInfo.PayloadId);

        public static readonly string DataDir = Path.Combine(BaseDir, "data");

        public static readonly string LogDir = Path.Combine(BaseDir, "logs");

        public static readonly string PortFile = Path.Combine(BaseDir, "port.txt");

        public static string LogFile
        {
            get { return Path.Combine(LogDir, "server-" + DateTime.Now.ToString("yyyyMMdd") + ".log"); }
        }
    }

    internal static class Program
    {
        private const string AppTitle = "MyToolHub";
        private const string MutexName = "Local\\MyToolHub.SingleInstance";
        private const string PayloadResource = "MyToolHub.Payload.zip";
        private static readonly object LogLock = new object();

        [STAThread]
        private static void Main()
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            bool createdNew;
            using (Mutex mutex = new Mutex(true, MutexName, out createdNew))
            {
                if (!createdNew)
                {
                    ShowExistingInstance();
                    return;
                }

                try
                {
                    RunApplication();
                }
                catch (Exception ex)
                {
                    ShowFatalError(ex);
                }
            }
        }

        private static void RunApplication()
        {
            Directory.CreateDirectory(AppPaths.BaseDir);
            Directory.CreateDirectory(AppPaths.DataDir);
            Directory.CreateDirectory(AppPaths.LogDir);

            Log("============================================================");
            Log("MyToolHub 启动器 v" + BuildInfo.Version + " / payload " + BuildInfo.PayloadId);
            Log("程序目录：" + AppPaths.AppDir);
            Log("数据目录：" + AppPaths.DataDir);

            EnsurePayload();
            CleanupOldPayloads();

            int port = FindFreePort(3000);
            string instanceId = Guid.NewGuid().ToString("N");
            string appUrl = "http://127.0.0.1:" + port.ToString();

            Log("选择端口：" + port.ToString());
            Process server = StartServer(port, instanceId);

            try
            {
                if (!WaitForServer(server, appUrl, instanceId))
                {
                    string reason = server.HasExited
                        ? "后端服务进程已退出。"
                        : "等待后端服务启动超时。";
                    throw new InvalidOperationException(
                        reason + Environment.NewLine + Environment.NewLine +
                        "请查看日志排查：" + AppPaths.LogFile);
                }

                File.WriteAllText(AppPaths.PortFile, port.ToString());
                Log("服务已就绪：" + appUrl);

                TrayContext context = new TrayContext(server, appUrl, port);
                context.OpenApp();
                Application.Run(context);
            }
            finally
            {
                try
                {
                    if (!server.HasExited)
                    {
                        server.Kill();
                        server.WaitForExit(3000);
                    }
                }
                catch (Exception)
                {
                }

                try
                {
                    File.Delete(AppPaths.PortFile);
                }
                catch (Exception)
                {
                }
            }
        }

        private static void EnsurePayload()
        {
            string marker = Path.Combine(AppPaths.AppDir, ".ready");
            if (File.Exists(marker))
            {
                return;
            }

            string tempDir = AppPaths.AppDir + ".tmp-" + Guid.NewGuid().ToString("N");
            Log("首次运行，正在解压内置程序到：" + AppPaths.AppDir);

            try
            {
                if (Directory.Exists(tempDir))
                {
                    Directory.Delete(tempDir, true);
                }
                Directory.CreateDirectory(tempDir);

                using (Stream stream = Assembly.GetExecutingAssembly().GetManifestResourceStream(PayloadResource))
                {
                    if (stream == null)
                    {
                        throw new InvalidOperationException("内置程序包缺失，文件可能已损坏。");
                    }

                    using (ZipArchive archive = new ZipArchive(stream, ZipArchiveMode.Read))
                    {
                        string tempRoot = Path.GetFullPath(tempDir) + Path.DirectorySeparatorChar;
                        foreach (ZipArchiveEntry entry in archive.Entries)
                        {
                            string relative = entry.FullName.Replace('/', Path.DirectorySeparatorChar);
                            string destination = Path.GetFullPath(Path.Combine(tempDir, relative));
                            if (!destination.StartsWith(tempRoot, StringComparison.OrdinalIgnoreCase))
                            {
                                throw new InvalidOperationException("程序包内容非法：" + entry.FullName);
                            }

                            if (String.IsNullOrEmpty(entry.Name))
                            {
                                Directory.CreateDirectory(destination);
                                continue;
                            }

                            Directory.CreateDirectory(Path.GetDirectoryName(destination));
                            entry.ExtractToFile(destination, true);
                        }
                    }
                }

                File.WriteAllText(Path.Combine(tempDir, ".ready"), DateTime.Now.ToString("o"));
                if (Directory.Exists(AppPaths.AppDir))
                {
                    Directory.Delete(AppPaths.AppDir, true);
                }
                Directory.Move(tempDir, AppPaths.AppDir);
                Log("解压完成。");
            }
            catch (Exception)
            {
                try
                {
                    if (Directory.Exists(tempDir))
                    {
                        Directory.Delete(tempDir, true);
                    }
                }
                catch (Exception)
                {
                }
                throw;
            }
        }

        private static void CleanupOldPayloads()
        {
            try
            {
                string current = Path.GetFullPath(AppPaths.AppDir).TrimEnd(Path.DirectorySeparatorChar);
                foreach (string dir in Directory.GetDirectories(AppPaths.BaseDir, "app-*"))
                {
                    string full = Path.GetFullPath(dir).TrimEnd(Path.DirectorySeparatorChar);
                    if (String.Equals(full, current, StringComparison.OrdinalIgnoreCase))
                    {
                        continue;
                    }

                    try
                    {
                        Directory.Delete(full, true);
                        Log("清理旧版本目录：" + full);
                    }
                    catch (Exception)
                    {
                    }
                }
            }
            catch (Exception)
            {
            }
        }

        private static int FindFreePort(int startPort)
        {
            for (int port = startPort; port < startPort + 50; port++)
            {
                TcpListener listener = null;
                try
                {
                    listener = new TcpListener(IPAddress.Any, port);
                    listener.Start();
                    return port;
                }
                catch (SocketException)
                {
                }
                finally
                {
                    if (listener != null)
                    {
                        listener.Stop();
                    }
                }
            }

            throw new InvalidOperationException("找不到可用端口（已尝试 3000-3049）。");
        }

        private static Process StartServer(int port, string instanceId)
        {
            string nodeExe = Path.Combine(AppPaths.AppDir, "node", "node.exe");
            string serverJs = Path.Combine(AppPaths.AppDir, "backend", "dist", "server.js");

            if (!File.Exists(nodeExe))
            {
                throw new FileNotFoundException("缺少 Node.js 运行时：" + nodeExe);
            }
            if (!File.Exists(serverJs))
            {
                throw new FileNotFoundException("缺少后端程序：" + serverJs);
            }

            ProcessStartInfo startInfo = new ProcessStartInfo();
            startInfo.FileName = nodeExe;
            startInfo.Arguments = "\"" + serverJs + "\"";
            startInfo.WorkingDirectory = Path.Combine(AppPaths.AppDir, "backend");
            startInfo.UseShellExecute = false;
            startInfo.CreateNoWindow = true;
            startInfo.RedirectStandardOutput = true;
            startInfo.RedirectStandardError = true;
            // Node 输出 UTF-8；不显式指定时 .NET 会按系统 ANSI 代码页解码，中文日志会乱码
            startInfo.StandardOutputEncoding = Encoding.UTF8;
            startInfo.StandardErrorEncoding = Encoding.UTF8;
            startInfo.EnvironmentVariables["PORT"] = port.ToString();
            startInfo.EnvironmentVariables["HOST"] = "0.0.0.0";
            startInfo.EnvironmentVariables["NODE_ENV"] = "production";
            startInfo.EnvironmentVariables["TOOLHUB_DB_PATH"] = Path.Combine(AppPaths.DataDir, "toolhub.db");
            startInfo.EnvironmentVariables["TOOLHUB_FRONTEND_DIST"] = Path.Combine(AppPaths.AppDir, "frontend", "dist");
            startInfo.EnvironmentVariables["TOOLHUB_INSTANCE_ID"] = instanceId;

            Process process = new Process();
            process.StartInfo = startInfo;
            process.EnableRaisingEvents = true;
            process.OutputDataReceived += delegate(object sender, DataReceivedEventArgs e)
            {
                if (e.Data != null)
                {
                    Log("[out] " + e.Data);
                }
            };
            process.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs e)
            {
                if (e.Data != null)
                {
                    Log("[err] " + e.Data);
                }
            };

            process.Start();
            process.BeginOutputReadLine();
            process.BeginErrorReadLine();
            return process;
        }

        private static bool WaitForServer(Process server, string appUrl, string instanceId)
        {
            DateTime deadline = DateTime.UtcNow.AddSeconds(45);
            while (DateTime.UtcNow < deadline)
            {
                if (server.HasExited)
                {
                    return false;
                }

                try
                {
                    HttpWebRequest request = (HttpWebRequest)WebRequest.Create(appUrl + "/api/health");
                    request.Proxy = null;
                    request.Timeout = 1500;
                    request.ReadWriteTimeout = 1500;
                    request.KeepAlive = false;

                    using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
                    using (StreamReader reader = new StreamReader(response.GetResponseStream(), Encoding.UTF8))
                    {
                        string body = reader.ReadToEnd();
                        if (body.IndexOf(instanceId, StringComparison.OrdinalIgnoreCase) >= 0)
                        {
                            return true;
                        }
                    }
                }
                catch (WebException)
                {
                }
                catch (Exception)
                {
                }

                Thread.Sleep(300);
            }

            return false;
        }

        private static bool IsHealthy(string appUrl)
        {
            try
            {
                HttpWebRequest request = (HttpWebRequest)WebRequest.Create(appUrl + "/api/health");
                request.Proxy = null;
                request.Timeout = 1200;
                request.ReadWriteTimeout = 1200;
                request.KeepAlive = false;
                using (HttpWebResponse response = (HttpWebResponse)request.GetResponse())
                {
                    return response.StatusCode == HttpStatusCode.OK;
                }
            }
            catch (Exception)
            {
                return false;
            }
        }

        private static void ShowExistingInstance()
        {
            try
            {
                if (File.Exists(AppPaths.PortFile))
                {
                    int port;
                    if (int.TryParse(File.ReadAllText(AppPaths.PortFile).Trim(), out port))
                    {
                        string url = "http://127.0.0.1:" + port.ToString();
                        if (IsHealthy(url))
                        {
                            OpenUrl(url);
                            return;
                        }
                    }
                }
            }
            catch (Exception)
            {
            }

            MessageBox.Show(
                "MyToolHub 已经在运行，请查看系统托盘中的图标。",
                AppTitle,
                MessageBoxButtons.OK,
                MessageBoxIcon.Information);
        }

        internal static void OpenUrl(string url)
        {
            string browser = FindBrowser();
            if (browser != null)
            {
                try
                {
                    Process.Start(browser, "--app=" + url + " --window-size=1360,900 --no-first-run --no-default-browser-check");
                    return;
                }
                catch (Exception)
                {
                }
            }

            try
            {
                Process.Start(url);
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    "无法打开浏览器：" + ex.Message + Environment.NewLine + Environment.NewLine + url,
                    AppTitle,
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning);
            }
        }

        private static string FindBrowser()
        {
            string programFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
            string programFilesX86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
            string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);

            string[] candidates = new string[]
            {
                Path.Combine(programFilesX86, "Microsoft", "Edge", "Application", "msedge.exe"),
                Path.Combine(programFiles, "Microsoft", "Edge", "Application", "msedge.exe"),
                Path.Combine(localAppData, "Microsoft", "Edge", "Application", "msedge.exe"),
                Path.Combine(programFiles, "Google", "Chrome", "Application", "chrome.exe"),
                Path.Combine(programFilesX86, "Google", "Chrome", "Application", "chrome.exe"),
                Path.Combine(localAppData, "Google", "Chrome", "Application", "chrome.exe")
            };

            for (int i = 0; i < candidates.Length; i++)
            {
                if (File.Exists(candidates[i]))
                {
                    return candidates[i];
                }
            }

            return null;
        }

        internal static void Log(string message)
        {
            try
            {
                lock (LogLock)
                {
                    string logFile = AppPaths.LogFile;
                    try
                    {
                        // 日志超过 5 MB 时轮转为 .1，避免长期运行无限增长
                        FileInfo info = new FileInfo(logFile);
                        if (info.Exists && info.Length > 5 * 1024 * 1024)
                        {
                            string backup = logFile + ".1";
                            if (File.Exists(backup))
                            {
                                File.Delete(backup);
                            }
                            File.Move(logFile, backup);
                        }
                    }
                    catch (Exception)
                    {
                    }

                    File.AppendAllText(
                        logFile,
                        DateTime.Now.ToString("yyyy-MM-dd HH:mm:ss.fff") + " " + message + Environment.NewLine,
                        new UTF8Encoding(false));
                }
            }
            catch (Exception)
            {
            }
        }

        private static void ShowFatalError(Exception ex)
        {
            Log("启动失败：" + ex.ToString());
            MessageBox.Show(
                "MyToolHub 启动失败：" + Environment.NewLine + Environment.NewLine +
                ex.Message + Environment.NewLine + Environment.NewLine +
                "日志文件：" + AppPaths.LogFile,
                AppTitle,
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
        }
    }

    internal sealed class TrayContext : ApplicationContext
    {
        private readonly NotifyIcon _notifyIcon;
        private readonly Process _server;
        private readonly string _appUrl;
        private readonly int _port;

        public TrayContext(Process server, string appUrl, int port)
        {
            _server = server;
            _appUrl = appUrl;
            _port = port;

            ContextMenuStrip menu = new ContextMenuStrip();
            ToolStripMenuItem openItem = new ToolStripMenuItem("打开 MyToolHub");
            openItem.Font = new Font(openItem.Font, FontStyle.Bold);
            openItem.Click += delegate { OpenApp(); };
            menu.Items.Add(openItem);

            ToolStripMenuItem addressItem = new ToolStripMenuItem("复制局域网访问地址");
            addressItem.Click += delegate { CopyLanAddress(); };
            menu.Items.Add(addressItem);

            menu.Items.Add(new ToolStripSeparator());

            ToolStripMenuItem dataItem = new ToolStripMenuItem("打开数据目录");
            dataItem.Click += delegate { OpenPath(AppPaths.DataDir); };
            menu.Items.Add(dataItem);

            ToolStripMenuItem logItem = new ToolStripMenuItem("查看运行日志");
            logItem.Click += delegate { OpenPath(AppPaths.LogFile); };
            menu.Items.Add(logItem);

            menu.Items.Add(new ToolStripSeparator());

            ToolStripMenuItem versionItem = new ToolStripMenuItem("版本 " + BuildInfo.Version);
            versionItem.Enabled = false;
            menu.Items.Add(versionItem);

            ToolStripMenuItem exitItem = new ToolStripMenuItem("退出 MyToolHub");
            exitItem.Click += delegate { ExitApplication(); };
            menu.Items.Add(exitItem);

            _notifyIcon = new NotifyIcon();
            try
            {
                _notifyIcon.Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
            }
            catch (Exception)
            {
            }
            if (_notifyIcon.Icon == null)
            {
                _notifyIcon.Icon = SystemIcons.Application;
            }
            _notifyIcon.Text = "MyToolHub 个人工具集";
            _notifyIcon.ContextMenuStrip = menu;
            _notifyIcon.Visible = true;
            _notifyIcon.DoubleClick += delegate { OpenApp(); };
            _notifyIcon.ShowBalloonTip(
                3000,
                "MyToolHub 已启动",
                "服务地址：" + _appUrl + "，双击托盘图标可重新打开。",
                ToolTipIcon.Info);
        }

        public void OpenApp()
        {
            if (_server.HasExited)
            {
                MessageBox.Show(
                    "后端服务已停止。" + Environment.NewLine + Environment.NewLine +
                    "请退出后重新启动 MyToolHub，或查看日志：" + AppPaths.LogFile,
                    "MyToolHub",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning);
                return;
            }

            Program.OpenUrl(_appUrl);
        }

        private void CopyLanAddress()
        {
            string ip = GetLanIp();
            if (String.IsNullOrEmpty(ip))
            {
                ip = "127.0.0.1";
            }

            string address = "http://" + ip + ":" + _port.ToString();
            try
            {
                Clipboard.SetText(address);
                _notifyIcon.ShowBalloonTip(
                    2500,
                    "局域网地址已复制",
                    address + Environment.NewLine + "手机与电脑需连接同一局域网。",
                    ToolTipIcon.Info);
            }
            catch (Exception)
            {
                MessageBox.Show(address, "局域网访问地址", MessageBoxButtons.OK, MessageBoxIcon.Information);
            }
        }

        private static string GetLanIp()
        {
            try
            {
                IPAddress[] addresses = Dns.GetHostAddresses(Dns.GetHostName());
                IPAddress fallback = null;
                for (int i = 0; i < addresses.Length; i++)
                {
                    IPAddress address = addresses[i];
                    if (address.AddressFamily != AddressFamily.InterNetwork || IPAddress.IsLoopback(address))
                    {
                        continue;
                    }

                    string text = address.ToString();
                    if (text.StartsWith("192.168.") || text.StartsWith("10."))
                    {
                        return text;
                    }
                    if (text.StartsWith("172.") && fallback == null)
                    {
                        fallback = address;
                    }
                    if (fallback == null)
                    {
                        fallback = address;
                    }
                }

                if (fallback != null)
                {
                    return fallback.ToString();
                }
            }
            catch (Exception)
            {
            }

            return "";
        }

        private static void OpenPath(string path)
        {
            try
            {
                if (!File.Exists(path) && !Directory.Exists(path))
                {
                    MessageBox.Show("路径不存在：" + path, "MyToolHub", MessageBoxButtons.OK, MessageBoxIcon.Information);
                    return;
                }
                Process.Start("explorer.exe", "\"" + path + "\"");
            }
            catch (Exception ex)
            {
                MessageBox.Show("无法打开：" + ex.Message, "MyToolHub", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            }
        }

        private void ExitApplication()
        {
            try
            {
                _notifyIcon.Visible = false;
            }
            catch (Exception)
            {
            }

            try
            {
                if (!_server.HasExited)
                {
                    _server.Kill();
                    _server.WaitForExit(3000);
                }
            }
            catch (Exception)
            {
            }

            ExitThread();
        }

        protected override void Dispose(bool disposing)
        {
            if (disposing)
            {
                try
                {
                    _notifyIcon.Visible = false;
                    _notifyIcon.Dispose();
                }
                catch (Exception)
                {
                }
            }

            base.Dispose(disposing);
        }
    }
}
