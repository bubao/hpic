package redact

import (
	"net/url"
	"regexp"
	"strings"
)

var (
	// bearerRegex 匹配 Authorization: Bearer xxx
	bearerRegex = regexp.MustCompile(`(?i)\b(bearer\s+)[A-Za-z0-9_\-\.]{8,}`)
	// gitHubTokenRegex 匹配 GitHub 访问令牌 (ghp_, gho_, github_pat_, etc.)
	gitHubTokenRegex = regexp.MustCompile(`\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{16,}|\bgithub_pat_[A-Za-z0-9_]{22,}`)
	// genericTokenRegex 匹配常见的 token/secret 参数或键值对
	genericTokenRegex = regexp.MustCompile(`(?i)\b(token|secret|password|access_token|client_secret|apikey|api_key)\s*[:=]\s*["']?([A-Za-z0-9_\-\.]{6,})["']?`)
	// credentialURLRegex 匹配 url 中的 user:password@
	credentialURLRegex = regexp.MustCompile(`://([^:]+):([^@]+)@`)
)

// RedactURL 对 URL 进行脱敏，隐藏用户信息中的密码及敏感查询参数。
func RedactURL(rawURL string) string {
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" {
		return ""
	}
	u, err := url.Parse(rawURL)
	if err != nil {
		// 无法以标准 URL 解析时降级走正则
		return credentialURLRegex.ReplaceAllString(rawURL, `://$1:***@`)
	}
	if u.User != nil {
		if _, hasPass := u.User.Password(); hasPass {
			u.User = url.UserPassword(u.User.Username(), "***")
		}
	}
	// 脱敏 query 中的敏感参数
	if u.RawQuery != "" {
		q := u.Query()
		modified := false
		for k := range q {
			lowerK := strings.ToLower(k)
			if strings.Contains(lowerK, "token") ||
				strings.Contains(lowerK, "key") ||
				strings.Contains(lowerK, "secret") ||
				strings.Contains(lowerK, "pass") ||
				lowerK == "client_id" {
				q.Set(k, "***")
				modified = true
			}
		}
		if modified {
			u.RawQuery = q.Encode()
		}
	}
	res := u.String()
	res = strings.ReplaceAll(res, "%2A%2A%2A", "***")
	return res
}

// RedactText 对日志文本、错误信息中的敏感信息进行脱敏。
func RedactText(text string) string {
	if text == "" {
		return ""
	}
	// 1. 替换 URL 认证信息
	text = credentialURLRegex.ReplaceAllString(text, `://$1:***@`)
	// 2. 替换 Bearer 令牌
	text = bearerRegex.ReplaceAllString(text, `${1}***`)
	// 3. 替换 GitHub Token
	text = gitHubTokenRegex.ReplaceAllString(text, `***`)
	// 4. 替换 generic key=value / key: value
	text = genericTokenRegex.ReplaceAllString(text, `$1: "***"`)
	return text
}

// RedactValue 递归脱敏结构化对象或键值对。
func RedactValue(v interface{}) interface{} {
	switch val := v.(type) {
	case string:
		if strings.Contains(val, "://") {
			return RedactText(RedactURL(val))
		}
		return RedactText(val)
	case map[string]interface{}:
		return RedactMap(val)
	case []interface{}:
		out := make([]interface{}, len(val))
		for i, elem := range val {
			out[i] = RedactValue(elem)
		}
		return out
	default:
		return val
	}
}

// RedactMap 对 Map 的敏感字段与值进行深拷贝脱敏。
func RedactMap(m map[string]interface{}) map[string]interface{} {
	if m == nil {
		return nil
	}
	out := make(map[string]interface{}, len(m))
	for k, v := range m {
		lowerK := strings.ToLower(k)
		if strings.Contains(lowerK, "password") ||
			strings.Contains(lowerK, "secret") ||
			strings.Contains(lowerK, "token") ||
			strings.Contains(lowerK, "auth") {
			out[k] = "***"
			continue
		}
		if lowerK == "proxy" {
			if strVal, ok := v.(string); ok {
				out[k] = RedactURL(strVal)
				continue
			}
		}
		out[k] = RedactValue(v)
	}
	return out
}
