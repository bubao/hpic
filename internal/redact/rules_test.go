package redact

import (
	"strings"
	"testing"
)

func TestRulesBuiltinOrder(t *testing.T) {
	rules := Rules()
	want := []string{"url.credential", "bearer.token", "github.token", "generic.token"}
	if len(rules) < len(want) {
		t.Fatalf("内置规则数量不足: %d", len(rules))
	}
	for i, name := range want {
		if rules[i].Name != name {
			t.Fatalf("内置规则顺序错误: got %q, want %q", rules[i].Name, name)
		}
	}
}

func TestRegisterRuleApplied(t *testing.T) {
	const name = "test.marker"
	RegisterRule(Rule{
		Name: name,
		Apply: func(text string) string {
			return strings.ReplaceAll(text, "CUSTOM_MARKER", "***")
		},
	})
	defer unregisterRule(name)

	input := "log CUSTOM_MARKER end"
	got := RedactText(input)
	if got != "log *** end" {
		t.Fatalf("自定义规则未生效: %q", got)
	}

	// 内置规则仍在自定义规则之前应用
	got = RedactText("Authorization: Bearer abc1234567890xyz CUSTOM_MARKER")
	if got != "Authorization: Bearer *** ***" {
		t.Fatalf("规则叠加结果错误: %q", got)
	}
}

func TestRegisterRulePanicsOnDuplicate(t *testing.T) {
	const name = "test.dup"
	RegisterRule(Rule{Name: name, Apply: func(text string) string { return text }})
	defer unregisterRule(name)

	defer func() {
		if recover() == nil {
			t.Fatal("重复注册同名规则应 panic")
		}
	}()
	RegisterRule(Rule{Name: name, Apply: func(text string) string { return text }})
}

func TestRegisterRuleIgnoresInvalid(t *testing.T) {
	before := len(Rules())
	RegisterRule(Rule{Name: "", Apply: func(text string) string { return text }})
	RegisterRule(Rule{Name: "test.nil", Apply: nil})
	if after := len(Rules()); after != before {
		t.Fatalf("无效规则不应被注册: before=%d after=%d", before, after)
	}
}
