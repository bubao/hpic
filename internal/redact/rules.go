package redact

import (
	"fmt"
	"slices"
	"sync"
)

// Rule 是一条文本脱敏规则：按注册顺序依次作用于 RedactText 的输入。
type Rule struct {
	// Name 是规则稳定标识，用于去重与诊断。
	Name string
	// Apply 对输入文本执行脱敏并返回结果；必须无副作用且可并发调用。
	Apply func(text string) string
}

// builtinRules 是随程序发布的内置脱敏规则，按声明顺序应用。
var builtinRules = []Rule{
	{
		Name:  "url.credential",
		Apply: func(text string) string { return credentialURLRegex.ReplaceAllString(text, `://$1:***@`) },
	},
	{
		Name:  "bearer.token",
		Apply: func(text string) string { return bearerRegex.ReplaceAllString(text, `${1}***`) },
	},
	{
		Name:  "github.token",
		Apply: func(text string) string { return gitHubTokenRegex.ReplaceAllString(text, `***`) },
	},
	{
		Name:  "generic.token",
		Apply: func(text string) string { return genericTokenRegex.ReplaceAllString(text, `$1: "***"`) },
	},
}

var (
	ruleMu     sync.RWMutex
	extraRules []Rule
)

// RegisterRule 追加一条自定义脱敏规则。
// Name 为空或 Apply 为 nil 时忽略；同名重复注册立即 panic。
func RegisterRule(r Rule) {
	if r.Name == "" || r.Apply == nil {
		return
	}
	ruleMu.Lock()
	defer ruleMu.Unlock()
	for _, existing := range extraRules {
		if existing.Name == r.Name {
			panic(fmt.Sprintf("redact: rule %q 重复注册", r.Name))
		}
	}
	extraRules = append(extraRules, r)
}

// Rules 返回内置规则与外部规则按注册顺序合并后的副本。
func Rules() []Rule {
	ruleMu.RLock()
	defer ruleMu.RUnlock()
	out := make([]Rule, 0, len(builtinRules)+len(extraRules))
	out = append(out, builtinRules...)
	out = append(out, extraRules...)
	return out
}

// unregisterRule 从注册表移除指定规则，仅供同包测试清理状态使用。
func unregisterRule(name string) {
	ruleMu.Lock()
	defer ruleMu.Unlock()
	extraRules = slices.DeleteFunc(extraRules, func(r Rule) bool { return r.Name == name })
}
