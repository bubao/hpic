#!/usr/bin/env python3
# dmgbuild setting for hpic
import os

# 从命令行 -D 传参拿到变量，未传则读取项目单一真相源 VERSION 文件
application = defines.get("app", "./hpic.app")
def read_project_version():
    candidates = ["VERSION", "../VERSION"]
    for path in candidates:
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    ver = f.read().strip()
                    if ver:
                        return ver
            except Exception:
                pass
    return "0.0.1"

version = defines.get("ver") or read_project_version()
app_name = os.path.basename(application)

# ========== 你的资源路径，和项目对齐 ==========
bg_path = "./assets/dmg-background.png"
vol_icon_path = "./native_macos/AppIcon.icns"
# ==========================================

# DMG 卷名
volume_name = "hpic"
# 输出压缩格式 UDZO（标准发布DMG）
format = "UDZO"
filesystem = "HFS+"

# 要放进DMG里的文件
files = [application]
# 自动创建 /Applications 软链接
symlinks = {
    "Applications": "/Applications"
}

# 窗口设置：位置、宽高
window_rect = ((400, 120), (600, 420))
# 图标大小
icon_size = 100
text_size = 12

# 图标坐标（和你之前统一）
icon_locations = {
    app_name: (160, 245),
    "Applications": (440, 245),
}

# 背景图片
background = bg_path

# 卷图标（侧边栏/桌面磁盘图标）
icon = vol_icon_path

# 隐藏app后缀（hpic.app 不显示 .app）
hide_extensions = [app_name]
