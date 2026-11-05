package post

import (
	"fmt"
	"os"
	"strings"
)

// InsertBodyImage 将图片以 Markdown 语法 (![title](url)) 追加插入至博文正文末尾
func InsertBodyImage(filePath, imageURL, imageTitle string, targetFields []string, dateOpts ...string) (*PostInfo, string, error) {
	filePath = strings.TrimSpace(filePath)
	imageURL = strings.TrimSpace(imageURL)
	if filePath == "" || imageURL == "" {
		return nil, "", fmt.Errorf("文件路径与图片链接不能为空")
	}

	data, err := os.ReadFile(filePath)
	if err != nil {
		return nil, "", fmt.Errorf("读取文章失败: %w", err)
	}

	content := string(data)
	content = strings.TrimPrefix(content, "\xef\xbb\xbf")

	title := strings.TrimSpace(imageTitle)
	if title == "" {
		title = "配图"
	}

	// 格式化标准 Markdown 图片语法
	mdImage := fmt.Sprintf("![%s](%s)", title, imageURL)

	// 确保在文末追加时格式规范清晰
	trimmed := strings.TrimRight(content, " \t\r\n")
	newContent := fmt.Sprintf("%s\n\n%s\n", trimmed, mdImage)

	if err := atomicWriteFile(filePath, []byte(newContent)); err != nil {
		return nil, "", fmt.Errorf("写入配图失败: %w", err)
	}

	info, err := ParsePost(filePath, targetFields, dateOpts...)
	if err != nil {
		return nil, mdImage, err
	}
	return info, mdImage, nil
}
