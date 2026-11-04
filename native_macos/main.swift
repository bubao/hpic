import Cocoa
import WebKit

class AppDelegate: NSObject, NSApplicationDelegate, NSWindowDelegate, WKUIDelegate, WKNavigationDelegate {
    var window: NSWindow!
    var webView: WKWebView!
    var targetURL: URL?

    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        setupAppIcon()

        let args = CommandLine.arguments
        let urlStr = args.count > 1 ? args[1] : "http://127.0.0.1:38120"
        self.targetURL = URL(string: urlStr)

        setupMenu()
        createWindow()

        if let url = self.targetURL {
            webView.load(URLRequest(url: url))
        }

        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func setupAppIcon() {
        if let bundleIcon = Bundle.main.image(forResource: "AppIcon") {
            NSApp.applicationIconImage = bundleIcon
            return
        }
        let execPath = CommandLine.arguments[0]
        let execDir = URL(fileURLWithPath: execPath).deletingLastPathComponent().path
        let possiblePaths = [
            execDir + "/../Resources/AppIcon.icns",
            execDir + "/AppIcon.icns",
            NSHomeDirectory() + "/Applications/hpic.app/Contents/Resources/AppIcon.icns",
            "/Applications/hpic.app/Contents/Resources/AppIcon.icns",
            NSHomeDirectory() + "/Applications/HexoPic.app/Contents/Resources/AppIcon.icns",
            "/Applications/HexoPic.app/Contents/Resources/AppIcon.icns"
        ]
        for path in possiblePaths {
            if FileManager.default.fileExists(atPath: path), let img = NSImage(contentsOfFile: path) {
                NSApp.applicationIconImage = img
                return
            }
        }
    }

    func setupMenu() {
        let mainMenu = NSMenu()

        // App Menu
        let appMenuItem = NSMenuItem()
        let appMenu = NSMenu(title: "hpic")
        appMenu.addItem(withTitle: "关于 hpic", action: nil, keyEquivalent: "")
        appMenu.addItem(NSMenuItem.separator())
        appMenu.addItem(withTitle: "隐藏 hpic", action: #selector(NSApplication.hide(_:)), keyEquivalent: "h")
        let hideOthersItem = appMenu.addItem(withTitle: "隐藏其他", action: #selector(NSApplication.hideOtherApplications(_:)), keyEquivalent: "h")
        hideOthersItem.keyEquivalentModifierMask = [.command, .option]
        appMenu.addItem(withTitle: "全部显示", action: #selector(NSApplication.unhideAllApplications(_:)), keyEquivalent: "")
        appMenu.addItem(NSMenuItem.separator())
        appMenu.addItem(withTitle: "退出 hpic", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appMenuItem.submenu = appMenu
        mainMenu.addItem(appMenuItem)

        // Edit Menu (保证复制粘贴快捷键正常工作)
        let editMenuItem = NSMenuItem()
        let editMenu = NSMenu(title: "编辑")
        editMenu.addItem(withTitle: "撤销", action: Selector(("undo:")), keyEquivalent: "z")
        editMenu.addItem(withTitle: "重做", action: Selector(("redo:")), keyEquivalent: "Z")
        editMenu.addItem(NSMenuItem.separator())
        editMenu.addItem(withTitle: "剪切", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "复制", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "粘贴", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "全选", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")
        editMenuItem.submenu = editMenu
        mainMenu.addItem(editMenuItem)

        // View Menu
        let viewMenuItem = NSMenuItem()
        let viewMenu = NSMenu(title: "查看")
        viewMenu.addItem(withTitle: "重新加载", action: #selector(reloadPage), keyEquivalent: "r")
        viewMenu.addItem(withTitle: "全屏", action: #selector(NSWindow.toggleFullScreen(_:)), keyEquivalent: "f")
        viewMenuItem.submenu = viewMenu
        mainMenu.addItem(viewMenuItem)

        // Window Menu
        let windowMenuItem = NSMenuItem()
        let windowMenu = NSMenu(title: "窗口")
        windowMenu.addItem(withTitle: "最小化", action: #selector(NSWindow.miniaturize(_:)), keyEquivalent: "m")
        windowMenu.addItem(withTitle: "关闭窗口", action: #selector(NSWindow.performClose(_:)), keyEquivalent: "w")
        windowMenuItem.submenu = windowMenu
        mainMenu.addItem(windowMenuItem)

        NSApp.mainMenu = mainMenu
    }

    func createWindow() {
        let screenRect = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1280, height: 820)
        let w: CGFloat = min(1320, max(1100, screenRect.width * 0.82))
        let h: CGFloat = min(860, max(750, screenRect.height * 0.85))
        let x = screenRect.minX + (screenRect.width - w) / 2
        let y = screenRect.minY + (screenRect.height - h) / 2

        let windowRect = NSRect(x: x, y: y, width: w, height: h)
        window = NSWindow(
            contentRect: windowRect,
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )

        window.title = "hpic"
        window.titleVisibility = .visible
        window.minSize = NSSize(width: 960, height: 640)
        window.center()
        window.delegate = self

        let config = WKWebViewConfiguration()
        let prefs = WKPreferences()
        config.preferences = prefs

        webView = WKWebView(frame: window.contentView!.bounds, configuration: config)
        webView.autoresizingMask = [.width, .height]
        webView.uiDelegate = self
        webView.navigationDelegate = self
        webView.setValue(false, forKey: "drawsBackground") // 暗色支持

        window.contentView?.addSubview(webView)
    }

    @objc func reloadPage() {
        if let url = targetURL {
            webView.load(URLRequest(url: url))
        } else {
            webView.reload()
        }
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        window?.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        return true
    }

    func applicationDidBecomeActive(_ notification: Notification) {
        // 当应用程序被重新激活（如点击 Dock 图标或快捷键唤回）时，若窗口不可见则恢复显示
        if let win = window, !win.isVisible {
            win.makeKeyAndOrderFront(nil)
        }
    }

    func windowShouldClose(_ sender: NSWindow) -> Bool {
        // macOS 原生体验：点击左上角红色 x 关闭按钮时，仅隐藏/关闭窗口至后台，应用程序常驻
        sender.orderOut(nil)
        return false
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        // 最后一个窗口关闭后不退出程序；用户可通过 Cmd+Q 或菜单栏「退出 hpic」真正退出
        return false
    }

    // 捕获 window.open(...) 和 target="_blank"，自动由系统默认浏览器打开
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url {
            NSWorkspace.shared.open(url)
        }
        return nil
    }

    // 捕获网页内非本地服务的链接点击，自动由系统默认浏览器打开
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.allow)
            return
        }

        if navigationAction.navigationType == .linkActivated {
            if let host = url.host, host != "127.0.0.1" && host != "localhost" {
                NSWorkspace.shared.open(url)
                decisionHandler(.cancel)
                return
            }
        }
        decisionHandler(.allow)
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
