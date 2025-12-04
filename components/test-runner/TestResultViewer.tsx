'use client';

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { CheckCircle2, XCircle, Clock, ChevronDown, AlertCircle } from 'lucide-react';
import type { TestSuiteResult, TestResult } from '@/types/electron';

interface TestResultViewerProps {
  result: TestSuiteResult;
}

/**
 * 테스트 결과 표시 컴포넌트
 */
export function TestResultViewer({ result }: TestResultViewerProps) {
  const getStatusIcon = (status: 'pass' | 'fail' | 'skip') => {
    switch (status) {
      case 'pass':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'fail':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'skip':
        return <AlertCircle className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status: 'pass' | 'fail' | 'skip') => {
    switch (status) {
      case 'pass':
        return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'fail':
        return 'bg-red-500/10 text-red-500 border-red-500/20';
      case 'skip':
        return 'bg-gray-500/10 text-gray-500 border-gray-500/20';
    }
  };

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <div className="p-3 border rounded-lg">
          <p className="text-sm text-muted-foreground">Total</p>
          <p className="text-2xl font-bold">{result.summary.total}</p>
        </div>
        <div className="p-3 border rounded-lg border-green-500/20 bg-green-500/5">
          <p className="text-sm text-green-600">Passed</p>
          <p className="text-2xl font-bold text-green-600">{result.summary.passed}</p>
        </div>
        <div className="p-3 border rounded-lg border-red-500/20 bg-red-500/5">
          <p className="text-sm text-red-600">Failed</p>
          <p className="text-2xl font-bold text-red-600">{result.summary.failed}</p>
        </div>
        <div className="p-3 border rounded-lg">
          <p className="text-sm text-muted-foreground">Skipped</p>
          <p className="text-2xl font-bold">{result.summary.skipped}</p>
        </div>
      </div>

      {/* Duration */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Clock className="w-4 h-4" />
        <span>Duration: {result.summary.duration}ms</span>
        <span className="ml-auto">{new Date(result.timestamp).toLocaleString('ko-KR')}</span>
      </div>

      {/* Test Results */}
      <div className="space-y-2">
        {result.tests.map((test: TestResult, index: number) => (
          <Collapsible key={test.id || index}>
            <Card>
              <CollapsibleTrigger className="w-full">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {getStatusIcon(test.status)}
                      <div className="text-left">
                        <p className="font-medium">{test.name}</p>
                        {test.message && (
                          <p className="text-sm text-muted-foreground">{test.message}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={getStatusColor(test.status)} variant="outline">
                        {test.status}
                      </Badge>
                      <span className="text-xs text-muted-foreground">{test.duration}ms</span>
                      <ChevronDown className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </div>
                </CardContent>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0 px-4 pb-4 space-y-2">
                  {test.error && (
                    <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                      <p className="text-sm font-medium text-red-600 mb-1">Error:</p>
                      <pre className="text-xs text-red-600 whitespace-pre-wrap overflow-x-auto">
                        {test.error}
                      </pre>
                    </div>
                  )}
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>ID: {test.id}</span>
                    <span>Duration: {test.duration}ms</span>
                    <span>Time: {new Date(test.timestamp).toLocaleString('ko-KR')}</span>
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        ))}
      </div>
    </div>
  );
}
