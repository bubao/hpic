.PHONY: all check-env build build-frontend build-frontend-force clean run install app dmg dist test version

BINARY_NAME=hpic-desktop
APP_NAME=hpic.app

VERSION ?= $(shell (git describe --tags --abbrev=0 2>/dev/null || echo "0.0.1") | sed 's/^v//')
GIT_COMMIT ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo "dev")
BUILD_DATE ?= $(shell date -u +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || echo "unknown")
LDFLAGS := -w -s -X main.Version=$(VERSION) -X main.GitCommit=$(GIT_COMMIT) -X main.BuildDate=$(BUILD_DATE)

UNAME_S := $(shell uname -s 2>/dev/null || echo "Unknown")

check-env:
	@command -v go >/dev/null 2>&1 || (echo "[ERROR] 未检测到 Go 编译器，要求 Go >= 1.22"; exit 1)
	@command -v node >/dev/null 2>&1 || (echo "[ERROR] 未检测到 Node.js，要求 Node.js >= 18.0 (https://nodejs.org)"; exit 1)
	@command -v npm >/dev/null 2>&1 || (echo "[ERROR] 未检测到 npm 包管理器"; exit 1)
	@NODE_MAJOR=$$(node -v | sed 's/v//' | cut -d. -f1); \
	if [ "$$NODE_MAJOR" -lt 18 ]; then \
		echo "[ERROR] 当前 Node.js 版本 ($$(node -v)) 过低，要求 >= 18.0"; exit 1; \
	fi

ifeq ($(UNAME_S),Darwin)
all: build app
else
all: build
endif

FRONTEND_SOURCES := $(shell find frontend/src -type f 2>/dev/null) frontend/package.json frontend/index.html frontend/vite.config.ts

web/index.html: $(FRONTEND_SOURCES)
	@if which npm > /dev/null 2>&1; then \
		echo "[INFO] 检测到前端源码变动或静态资源缺失，正在自动增量编译前端产物..."; \
		if [ ! -d frontend/node_modules ]; then \
			echo "   [INFO] 安装前端依赖 (npm install)..."; \
			(cd frontend && npm install); \
		fi; \
		(cd frontend && npm run build); \
	else \
		if [ ! -f web/index.html ]; then \
			echo "[WARN] 警告: 未检测到前端构建产物 web/index.html，且系统未安装 npm。请先安装 Node.js 后执行构建。"; exit 1; \
		fi; \
	fi

build-frontend: web/index.html

build-frontend-force:
	@rm -rf web/assets web/index.html web/favicon.svg
	@touch web/placeholder.txt
	@$(MAKE) web/index.html

version:
	@echo $(VERSION)

build: check-env build-frontend
	@test -s web/index.html || (echo "[ERROR] 前端构建产物 web/index.html 不存在或为空！"; exit 1)
	@tmp_bin=$$(mktemp "/tmp/hpic_bin.XXXXXX"); \
	go build -ldflags="$(LDFLAGS)" -o $$tmp_bin .; \
	if [ "$$(uname -s)" = "Darwin" ]; then \
		codesign --force --options runtime --sign - $$tmp_bin 2>/dev/null || true; \
	fi; \
	rm -f $(BINARY_NAME) hpic; \
	mv -f $$tmp_bin $(BINARY_NAME); \
	chmod +x $(BINARY_NAME); \
	ln -sf $(BINARY_NAME) hpic
	@if [ -f native_macos/main.swift ] && which swiftc > /dev/null; then \
		swiftc -O -target arm64-apple-macosx11.0 native_macos/main.swift -o native_macos/hpic-mac-ui-arm64 2>/dev/null || true; \
		swiftc -O -target x86_64-apple-macosx10.15 native_macos/main.swift -o native_macos/hpic-mac-ui-amd64 2>/dev/null || true; \
		if [ -f native_macos/hpic-mac-ui-arm64 ] && [ -f native_macos/hpic-mac-ui-amd64 ] && which lipo > /dev/null; then \
			lipo -create -output native_macos/hpic-mac-ui native_macos/hpic-mac-ui-arm64 native_macos/hpic-mac-ui-amd64; \
			rm -f native_macos/hpic-mac-ui-arm64 native_macos/hpic-mac-ui-amd64; \
		else \
			swiftc -O native_macos/main.swift -o native_macos/hpic-mac-ui 2>/dev/null || true; \
		fi; \
		if [ "$$(uname -s)" = "Darwin" ] && [ -f native_macos/hpic-mac-ui ]; then \
			codesign --force --options runtime --sign - native_macos/hpic-mac-ui 2>/dev/null || true; \
		fi; \
	fi

app: build
	@if [ ! -f native_macos/AppIcon.icns ] && which node > /dev/null 2>&1; then \
		echo "[INFO] 正在由 assets/icon.svg 自动生成 native_macos/AppIcon.icns..."; \
		node scripts/build-icons.mjs > /dev/null 2>&1 || true; \
	fi
	@mkdir -p $(APP_NAME)/Contents/MacOS
	@mkdir -p $(APP_NAME)/Contents/Resources
	@rm -f $(APP_NAME)/Contents/MacOS/hpic-desktop
	@if which lipo > /dev/null 2>&1 && [ "$$(uname -s)" = "Darwin" ]; then \
		tmp_arm=$$(mktemp "/tmp/hpic_arm.XXXXXX"); \
		tmp_amd=$$(mktemp "/tmp/hpic_amd.XXXXXX"); \
		if GOOS=darwin GOARCH=arm64 go build -ldflags="$(LDFLAGS)" -o $$tmp_arm . 2>/dev/null && \
		   GOOS=darwin GOARCH=amd64 go build -ldflags="$(LDFLAGS)" -o $$tmp_amd . 2>/dev/null; then \
			lipo -create -output $(APP_NAME)/Contents/MacOS/hpic-desktop $$tmp_arm $$tmp_amd 2>/dev/null || true; \
		fi; \
		rm -f $$tmp_arm $$tmp_amd; \
	fi
	@if [ ! -f $(APP_NAME)/Contents/MacOS/hpic-desktop ]; then \
		cp $(BINARY_NAME) $(APP_NAME)/Contents/MacOS/hpic-desktop; \
	fi
	@if [ -f native_macos/hpic-mac-ui ]; then \
		rm -f $(APP_NAME)/Contents/MacOS/hpic-mac-ui; \
		cp native_macos/hpic-mac-ui $(APP_NAME)/Contents/MacOS/hpic-mac-ui; \
	fi
	@if [ -f native_macos/AppIcon.icns ]; then \
		cp native_macos/AppIcon.icns $(APP_NAME)/Contents/Resources/AppIcon.icns; \
	fi
	@printf '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n<dict>\n    <key>CFBundleExecutable</key>\n    <string>hpic-desktop</string>\n    <key>CFBundleIdentifier</key>\n    <string>com.hpic.desktop</string>\n    <key>CFBundleName</key>\n    <string>hpic</string>\n    <key>CFBundleDisplayName</key>\n    <string>hpic</string>\n    <key>CFBundleIconFile</key>\n    <string>AppIcon</string>\n    <key>CFBundlePackageType</key>\n    <string>APPL</string>\n    <key>CFBundleShortVersionString</key>\n    <string>%s</string>\n    <key>LSMinimumSystemVersion</key>\n    <string>10.15</string>\n    <key>NSHighResolutionCapable</key>\n    <true/>\n</dict>\n</plist>\n' "$(VERSION)" > $(APP_NAME)/Contents/Info.plist
	@if [ "$$(uname -s)" = "Darwin" ]; then \
		codesign --force --deep --options runtime --sign - $(APP_NAME) 2>/dev/null || true; \
	fi
	@echo "   [OK] $(APP_NAME) 原生独立应用打包完成"

dmg: app
	@./scripts/package-dmg.sh $(VERSION)

dist:
	@./scripts/build-all.sh

release:
	@if [ -f ./scripts/release.sh ]; then ./scripts/release.sh; else echo "请推送版本 Tag 触发发布: git tag v0.0.1 && git push origin v0.0.1"; fi

install: build
	@./install.sh

test: build-frontend
	@echo "[INFO] 正在执行后端 Go 全量自动化单元测试与竞态检测..."
	@go test -race -v ./...
	@if [ -d frontend/node_modules ]; then \
		echo "[INFO] 正在执行前端 Vitest 自动化单元测试..."; \
		(cd frontend && npm run test); \
	fi

clean:
	rm -f $(BINARY_NAME) hpic
	rm -f native_macos/hpic-mac-ui
	rm -rf dist
	rm -rf $(APP_NAME)
	rm -rf web/assets web/index.html web/favicon.svg
	@mkdir -p web && touch web/placeholder.txt
