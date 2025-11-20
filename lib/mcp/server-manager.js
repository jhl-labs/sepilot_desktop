"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MCPServerManager = void 0;
/**
 * MCP Server Manager
 *
 * 여러 MCP 서버를 관리하는 싱글톤 클래스
 */
class MCPServerManagerClass {
    constructor() {
        this.servers = new Map();
        this.allTools = [];
    }
    /**
     * 서버 추가 (Renderer에서 호출)
     */
    async addServer(config) {
        // Renderer에서는 IPC를 통해 Main Process에 요청
        if (typeof window !== 'undefined' && window.electronAPI) {
            const result = await window.electronAPI.mcp.addServer(config);
            if (!result.success) {
                throw new Error(result.error || 'Failed to add MCP server');
            }
        }
        else {
            throw new Error('MCP Server Manager only works in Electron environment');
        }
    }
    /**
     * 서버 제거 (Renderer에서 호출)
     */
    async removeServer(name) {
        if (typeof window !== 'undefined' && window.electronAPI) {
            const result = await window.electronAPI.mcp.removeServer(name);
            if (!result.success) {
                throw new Error(result.error || 'Failed to remove MCP server');
            }
        }
    }
    /**
     * 서버 목록 가져오기
     */
    async listServers() {
        if (typeof window !== 'undefined' && window.electronAPI) {
            const result = await window.electronAPI.mcp.listServers();
            if (result.success) {
                return result.data || [];
            }
        }
        return [];
    }
    /**
     * 모든 도구 가져오기
     */
    async getAllTools() {
        if (typeof window !== 'undefined' && window.electronAPI) {
            const result = await window.electronAPI.mcp.getAllTools();
            if (result.success) {
                return result.data || [];
            }
        }
        return [];
    }
    /**
     * 도구 호출
     */
    async callTool(serverName, toolName, args) {
        if (typeof window !== 'undefined' && window.electronAPI) {
            const result = await window.electronAPI.mcp.callTool(serverName, toolName, args);
            if (result.success) {
                return result.data;
            }
            else {
                throw new Error(result.error || 'Tool call failed');
            }
        }
        throw new Error('MCP not available');
    }
    /**
     * Main Process용 - 서버 추가
     */
    async addServerInMainProcess(client) {
        await client.connect();
        await client.initialize();
        const tools = await client.listTools();
        this.servers.set(client.getName(), client);
        this.updateAllTools();
        console.log(`MCP Server added: ${client.getName()} (${tools.length} tools)`);
    }
    /**
     * Main Process용 - 서버 제거
     */
    async removeServerInMainProcess(name) {
        const client = this.servers.get(name);
        if (client) {
            await client.disconnect();
            this.servers.delete(name);
            this.updateAllTools();
            console.log(`MCP Server removed: ${name}`);
        }
    }
    /**
     * Main Process용 - 서버 가져오기
     */
    getServerInMainProcess(name) {
        return this.servers.get(name);
    }
    /**
     * Main Process용 - 모든 도구 업데이트
     */
    updateAllTools() {
        this.allTools = [];
        for (const client of this.servers.values()) {
            this.allTools.push(...client.getTools());
        }
    }
    /**
     * Main Process용 - 모든 도구 가져오기
     */
    getAllToolsInMainProcess() {
        return this.allTools;
    }
    /**
     * Main Process용 - 모든 서버 목록
     */
    getAllServersInMainProcess() {
        return Array.from(this.servers.values());
    }
}
exports.MCPServerManager = new MCPServerManagerClass();
//# sourceMappingURL=server-manager.js.map