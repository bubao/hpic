package mcp

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"hpic/internal/config"
)

func TestMCPInitializeAndPing(t *testing.T) {
	cfg := &config.Config{
		Proxy: "http://user:{{PASSWORD_z7q4v16a}}@127.0.0.1:7890",
	}
	host := NewHost(cfg, nil, nil, nil, "v0.1.1")

	// 1. initialize
	initReq := []byte(`{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}`)
	resp := host.HandleJSONRPC(context.Background(), initReq)
	if resp == nil || resp.Error != nil {
		t.Fatalf("initialize failed: %+v", resp)
	}
	resMap, ok := resp.Result.(map[string]interface{})
	if !ok {
		t.Fatalf("expected map result, got %T", resp.Result)
	}
	serverInfo, ok := resMap["serverInfo"].(map[string]string)
	if !ok || serverInfo["name"] != "hpic" {
		t.Fatalf("unexpected serverInfo: %+v", resMap["serverInfo"])
	}

	// 2. ping
	pingReq := []byte(`{"jsonrpc":"2.0","id":2,"method":"ping"}`)
	pingResp := host.HandleJSONRPC(context.Background(), pingReq)
	if pingResp == nil || pingResp.Error != nil {
		t.Fatalf("ping failed: %+v", pingResp)
	}
}

func TestMCPToolsList(t *testing.T) {
	host := NewHost(nil, nil, nil, nil, "v0.1.1")
	req := []byte(`{"jsonrpc":"2.0","id":3,"method":"tools/list"}`)
	resp := host.HandleJSONRPC(context.Background(), req)
	if resp == nil || resp.Error != nil {
		t.Fatalf("tools/list failed: %+v", resp)
	}
	resMap := resp.Result.(map[string]interface{})
	tools := resMap["tools"].([]ToolDefinition)
	if len(tools) < 10 {
		t.Fatalf("expected at least 10 tools, got %d", len(tools))
	}
}

func TestMCPCallConfigAndRedaction(t *testing.T) {
	cfg := &config.Config{
		HexoDir: "/fake/hexo",
		Proxy:   "http://admin:secret123@127.0.0.1:1080",
	}
	host := NewHost(cfg, nil, nil, nil, "v0.1.1")

	callReq := []byte(`{
		"jsonrpc": "2.0",
		"id": 4,
		"method": "tools/call",
		"params": {
			"name": "hpic_get_config",
			"arguments": {}
		}
	}`)

	resp := host.HandleJSONRPC(context.Background(), callReq)
	if resp == nil || resp.Error != nil {
		t.Fatalf("tools/call failed: %+v", resp)
	}
	resMap := resp.Result.(map[string]interface{})
	if resMap["isError"] == true {
		t.Fatalf("call returned error: %+v", resMap)
	}
	content := resMap["content"].([]map[string]interface{})
	text := content[0]["text"].(string)

	if !bytes.Contains([]byte(text), []byte("admin:***@127.0.0.1:1080")) {
		t.Fatalf("expected proxy to be redacted, got:\n%s", text)
	}
}

func TestMCPServeHTTP(t *testing.T) {
	host := NewHost(nil, nil, nil, nil, "v0.1.1")

	reqBody := `{"jsonrpc":"2.0","id":5,"method":"tools/list"}`
	req := httptest.NewRequest(http.MethodPost, "/api/mcp", bytes.NewBufferString(reqBody))
	w := httptest.NewRecorder()

	host.ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}

	var resp JSONRPCResponse
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp.Error != nil {
		t.Fatalf("jsonrpc error: %+v", resp.Error)
	}
}
