'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { HealthStatus } from './HealthStatus';
import { TestResultViewer } from './TestResultViewer';
import { Play, Activity, Database, Zap, Settings, ArrowLeft, X } from 'lucide-react';
import type { HealthCheckResult, TestSuiteResult } from '@/types/electron';

import { logger } from '@/lib/utils/logger';
/**
 * Test Dashboard 메인 컴포넌트
 *
 * 시스템 Health Check 및 테스트 실행 결과를 통합 표시
 */
export function TestDashboard() {
  logger.info('[TestDashboard] Component rendering');

  const [healthCheck, setHealthCheck] = useState<HealthCheckResult | null>(null);
  const [allTestsResult, setAllTestsResult] = useState<TestSuiteResult | null>(null);
  const [llmTestsResult, setLlmTestsResult] = useState<TestSuiteResult | null>(null);
  const [databaseTestsResult, setDatabaseTestsResult] = useState<TestSuiteResult | null>(null);
  const [mcpTestsResult, setMcpTestsResult] = useState<TestSuiteResult | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);

  // localStorage에서 테스트 히스토리 불러오기
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const savedAllTests = localStorage.getItem('test-history:all');
    const savedLlmTests = localStorage.getItem('test-history:llm');
    const savedDatabaseTests = localStorage.getItem('test-history:database');
    const savedMcpTests = localStorage.getItem('test-history:mcp');

    if (savedAllTests) {
      setAllTestsResult(JSON.parse(savedAllTests));
    }
    if (savedLlmTests) {
      setLlmTestsResult(JSON.parse(savedLlmTests));
    }
    if (savedDatabaseTests) {
      setDatabaseTestsResult(JSON.parse(savedDatabaseTests));
    }
    if (savedMcpTests) {
      setMcpTestsResult(JSON.parse(savedMcpTests));
    }
  }, []);

  // Health Check 실행
  const runHealthCheck = React.useCallback(async () => {
    try {
      const result = await window.electronAPI.testRunner.healthCheck();
      setHealthCheck(result);
    } catch (error) {
      console.error('Health check failed:', error);
    }
  }, []);

  // 전체 테스트 실행
  const runAllTests = React.useCallback(async () => {
    setIsRunning(true);
    try {
      const result = await window.electronAPI.testRunner.runAll();
      setAllTestsResult(result);
      localStorage.setItem('test-history:all', JSON.stringify(result));
    } catch (error) {
      console.error('All tests failed:', error);
    } finally {
      setIsRunning(false);
    }
  }, []);

  // LLM 테스트 실행
  const runLlmTests = React.useCallback(async () => {
    logger.info('[TestDashboard] runLlmTests called');
    logger.info('[TestDashboard] window.electronAPI:', window.electronAPI);
    logger.info('[TestDashboard] window.electronAPI.testRunner:', window.electronAPI?.testRunner);

    if (!window.electronAPI?.testRunner) {
      console.error('[TestDashboard] testRunner API not available');
      return;
    }

    setIsRunning(true);
    try {
      logger.info('[TestDashboard] Calling window.electronAPI.testRunner.runLLM()');
      const result = await window.electronAPI.testRunner.runLLM();
      logger.info('[TestDashboard] LLM test result:', result);
      setLlmTestsResult(result);
      localStorage.setItem('test-history:llm', JSON.stringify(result));
    } catch (error) {
      console.error('[TestDashboard] LLM tests failed:', error);
    } finally {
      setIsRunning(false);
    }
  }, []);

  // Database 테스트 실행
  const runDatabaseTests = React.useCallback(async () => {
    setIsRunning(true);
    try {
      const result = await window.electronAPI.testRunner.runDatabase();
      setDatabaseTestsResult(result);
      localStorage.setItem('test-history:database', JSON.stringify(result));
    } catch (error) {
      console.error('Database tests failed:', error);
    } finally {
      setIsRunning(false);
    }
  }, []);

  // MCP 테스트 실행
  const runMcpTests = React.useCallback(async () => {
    setIsRunning(true);
    try {
      const result = await window.electronAPI.testRunner.runMCP();
      setMcpTestsResult(result);
      localStorage.setItem('test-history:mcp', JSON.stringify(result));
    } catch (error) {
      console.error('MCP tests failed:', error);
    } finally {
      setIsRunning(false);
    }
  }, []);

  // 초기 Health Check 실행
  useEffect(() => {
    runHealthCheck();
  }, [runHealthCheck]);

  // Auto-refresh Health Check (60초마다)
  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(() => {
        runHealthCheck();
      }, 60000); // 60초

      return () => clearInterval(interval);
    }
    return undefined;
  }, [autoRefresh, runHealthCheck]);

  // 메뉴에서 트리거된 테스트 실행 이벤트 리스너 (IPC + window custom events)
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    logger.info('[TestDashboard] Registering event listeners');

    // Window custom events 리스너 (메인 페이지에서 전달된 이벤트)
    const handleRunAllFromWindow = () => {
      logger.info('[TestDashboard] Received window event: run-all');
      runAllTests();
    };
    const handleHealthCheckFromWindow = () => {
      logger.info('[TestDashboard] Received window event: health-check');
      runHealthCheck();
    };
    const handleRunLLMFromWindow = () => {
      logger.info('[TestDashboard] Received window event: run-llm');
      runLlmTests();
    };
    const handleRunDatabaseFromWindow = () => {
      logger.info('[TestDashboard] Received window event: run-database');
      runDatabaseTests();
    };
    const handleRunMCPFromWindow = () => {
      logger.info('[TestDashboard] Received window event: run-mcp');
      runMcpTests();
    };

    window.addEventListener('test:run-all-from-menu', handleRunAllFromWindow);
    window.addEventListener('test:health-check-from-menu', handleHealthCheckFromWindow);
    window.addEventListener('test:run-llm-from-menu', handleRunLLMFromWindow);
    window.addEventListener('test:run-database-from-menu', handleRunDatabaseFromWindow);
    window.addEventListener('test:run-mcp-from-menu', handleRunMCPFromWindow);

    // IPC 이벤트 리스너 (Dashboard가 이미 열려있을 때)
    if (window.electronAPI) {
      logger.info('[TestDashboard] Registering IPC listeners');
      window.electronAPI.on('test:run-all-from-menu', runAllTests);
      window.electronAPI.on('test:health-check-from-menu', runHealthCheck);
      window.electronAPI.on('test:run-llm-from-menu', runLlmTests);
      window.electronAPI.on('test:run-database-from-menu', runDatabaseTests);
      window.electronAPI.on('test:run-mcp-from-menu', runMcpTests);
    }

    return () => {
      window.removeEventListener('test:run-all-from-menu', handleRunAllFromWindow);
      window.removeEventListener('test:health-check-from-menu', handleHealthCheckFromWindow);
      window.removeEventListener('test:run-llm-from-menu', handleRunLLMFromWindow);
      window.removeEventListener('test:run-database-from-menu', handleRunDatabaseFromWindow);
      window.removeEventListener('test:run-mcp-from-menu', handleRunMCPFromWindow);

      if (window.electronAPI) {
        window.electronAPI.removeListener('test:run-all-from-menu', runAllTests);
        window.electronAPI.removeListener('test:health-check-from-menu', runHealthCheck);
        window.electronAPI.removeListener('test:run-llm-from-menu', runLlmTests);
        window.electronAPI.removeListener('test:run-database-from-menu', runDatabaseTests);
        window.electronAPI.removeListener('test:run-mcp-from-menu', runMcpTests);
      }
    };
  }, [runAllTests, runHealthCheck, runLlmTests, runDatabaseTests, runMcpTests]);

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              window.location.href = '/';
            }}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            뒤로가기
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Test Dashboard</h1>
            <p className="text-muted-foreground">시스템 상태 및 테스트 실행 결과</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant={autoRefresh ? 'default' : 'outline'}
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            <Activity className="w-4 h-4 mr-2" />
            Auto-refresh {autoRefresh ? 'ON' : 'OFF'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              window.location.href = '/';
            }}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Health Check */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5" />
                Health Check
              </CardTitle>
              <CardDescription>시스템 전체 상태 검증</CardDescription>
            </div>
            <Button onClick={runHealthCheck} variant="outline" size="sm">
              <Activity className="w-4 h-4 mr-2" />
              새로고침
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {healthCheck ? <HealthStatus result={healthCheck} /> : <p>Loading...</p>}
        </CardContent>
      </Card>

      {/* Test Suites */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 전체 테스트 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Play className="w-5 h-5" />
              전체 테스트
            </CardTitle>
            <CardDescription>모든 테스트 스위트 실행</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={runAllTests} disabled={isRunning} className="w-full">
              <Play className="w-4 h-4 mr-2" />
              Run All Tests
            </Button>
            {allTestsResult && <TestResultViewer result={allTestsResult} />}
          </CardContent>
        </Card>

        {/* LLM 테스트 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5" />
              LLM Interaction
            </CardTitle>
            <CardDescription>LLM Provider 상태 테스트</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={() => {
                logger.info('[TestDashboard] Button clicked!');
                runLlmTests();
              }}
              disabled={isRunning}
              className="w-full"
              variant="outline"
            >
              <Play className="w-4 h-4 mr-2" />
              Run LLM Tests
            </Button>
            {llmTestsResult && <TestResultViewer result={llmTestsResult} />}
          </CardContent>
        </Card>

        {/* Database 테스트 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="w-5 h-5" />
              Database & VectorDB
            </CardTitle>
            <CardDescription>데이터베이스 연결 테스트</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={runDatabaseTests}
              disabled={isRunning}
              className="w-full"
              variant="outline"
            >
              <Play className="w-4 h-4 mr-2" />
              Run Database Tests
            </Button>
            {databaseTestsResult && <TestResultViewer result={databaseTestsResult} />}
          </CardContent>
        </Card>

        {/* MCP 테스트 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              MCP Tools
            </CardTitle>
            <CardDescription>MCP 서버 및 도구 테스트</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button onClick={runMcpTests} disabled={isRunning} className="w-full" variant="outline">
              <Play className="w-4 h-4 mr-2" />
              Run MCP Tests
            </Button>
            {mcpTestsResult && <TestResultViewer result={mcpTestsResult} />}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
