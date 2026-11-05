package version

import (
	"testing"
)

func TestResolveVersion(t *testing.T) {
	// 场景 1: 从内嵌的 VERSION 字符串动态提取
	sampleVersion := "0.0.9\n"
	v := ResolveVersion(sampleVersion)
	if v != "v0.0.9" {
		t.Errorf("Expected v0.0.9 from embedded version, got %s", v)
	}

	// 场景 2: 编译时通过 Version 变量显式注入覆盖
	orig := Version
	defer func() { Version = orig }()

	Version = "1.2.3"
	vInjected := ResolveVersion(sampleVersion)
	if vInjected != "v1.2.3" {
		t.Errorf("Expected v1.2.3 from ldflags, got %s", vInjected)
	}

	// 场景 3: 未传内嵌参数时，自动读取本地 VERSION 文件
	Version = ""
	vAuto := ResolveVersion()
	if vAuto != "v0.0.2" {
		t.Errorf("Expected v0.0.2 from local VERSION file, got %s", vAuto)
	}
}
