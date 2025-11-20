"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MCPClient = void 0;
/**
 * MCP Client 추상 클래스
 */
class MCPClient {
    constructor(config) {
        this.requestId = 0;
        this.isConnected = false;
        this.tools = [];
        this.resources = [];
        this.config = config;
    }
    /**
     * 서버 초기화
     */
    async initialize() {
        const request = {
            jsonrpc: '2.0',
            id: this.getNextId(),
            method: 'initialize',
            params: {
                protocolVersion: '2024-11-05',
                capabilities: {
                    tools: {},
                },
                clientInfo: {
                    name: 'sepilot-desktop',
                    version: '0.1.0',
                },
            },
        };
        const response = await this.sendRequest(request);
        if (response.error) {
            throw new Error(`Initialize error: ${response.error.message}`);
        }
        this.isConnected = true;
        return response.result;
    }
    /**
     * 사용 가능한 도구 목록 가져오기
     */
    async listTools() {
        const request = {
            jsonrpc: '2.0',
            id: this.getNextId(),
            method: 'tools/list',
            params: {},
        };
        const response = await this.sendRequest(request);
        if (response.error) {
            throw new Error(`List tools error: ${response.error.message}`);
        }
        this.tools = response.result.tools.map((tool) => ({
            ...tool,
            serverName: this.config.name,
        }));
        return this.tools;
    }
    /**
     * 도구 호출
     */
    async callTool(name, args) {
        const request = {
            jsonrpc: '2.0',
            id: this.getNextId(),
            method: 'tools/call',
            params: {
                name,
                arguments: args,
            },
        };
        const response = await this.sendRequest(request);
        if (response.error) {
            return {
                content: [
                    {
                        type: 'text',
                        text: `Error: ${response.error.message}`,
                    },
                ],
                isError: true,
            };
        }
        return response.result;
    }
    /**
     * 리소스 목록 가져오기
     */
    async listResources() {
        const request = {
            jsonrpc: '2.0',
            id: this.getNextId(),
            method: 'resources/list',
            params: {},
        };
        const response = await this.sendRequest(request);
        if (response.error) {
            throw new Error(`List resources error: ${response.error.message}`);
        }
        this.resources = response.result.resources;
        return this.resources;
    }
    /**
     * 리소스 읽기
     */
    async readResource(uri) {
        const request = {
            jsonrpc: '2.0',
            id: this.getNextId(),
            method: 'resources/read',
            params: {
                uri,
            },
        };
        const response = await this.sendRequest(request);
        if (response.error) {
            throw new Error(`Read resource error: ${response.error.message}`);
        }
        return response.result.contents[0].text;
    }
    /**
     * 다음 요청 ID 생성
     */
    getNextId() {
        return ++this.requestId;
    }
    /**
     * 연결 상태 확인
     */
    isReady() {
        return this.isConnected;
    }
    /**
     * 도구 목록 가져오기 (캐시된)
     */
    getTools() {
        return this.tools;
    }
    /**
     * 리소스 목록 가져오기 (캐시된)
     */
    getResources() {
        return this.resources;
    }
    /**
     * 서버 이름
     */
    getName() {
        return this.config.name;
    }
}
exports.MCPClient = MCPClient;
//# sourceMappingURL=client.js.map