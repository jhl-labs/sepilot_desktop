'use client';

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { CheckCircle2, XCircle, AlertCircle, Clock } from 'lucide-react';
import type { HealthCheckResult } from '@/types/electron';

interface HealthStatusProps {
  result: HealthCheckResult;
}

/**
 * Health Check 결과 표시 컴포넌트
 */
export function HealthStatus({ result }: HealthStatusProps) {
  const getStatusIcon = (status: 'pass' | 'fail' | 'warn') => {
    switch (status) {
      case 'pass':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'fail':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'warn':
        return <AlertCircle className="w-4 h-4 text-yellow-500" />;
    }
  };

  const getStatusColor = (status: 'pass' | 'fail' | 'warn') => {
    switch (status) {
      case 'pass':
        return 'bg-green-500/10 text-green-500 border-green-500/20';
      case 'fail':
        return 'bg-red-500/10 text-red-500 border-red-500/20';
      case 'warn':
        return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
    }
  };

  const getOverallStatusColor = (status: 'healthy' | 'degraded' | 'unhealthy') => {
    switch (status) {
      case 'healthy':
        return 'bg-green-500';
      case 'degraded':
        return 'bg-yellow-500';
      case 'unhealthy':
        return 'bg-red-500';
    }
  };

  return (
    <div className="space-y-4">
      {/* Overall Status */}
      <div className="flex items-center justify-between p-4 border rounded-lg">
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${getOverallStatusColor(result.status)}`} />
          <div>
            <p className="font-semibold capitalize">{result.status}</p>
            <p className="text-sm text-muted-foreground">{result.message}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="w-4 h-4" />
          {new Date(result.timestamp).toLocaleString('ko-KR')}
        </div>
      </div>

      {/* Individual Checks */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Database */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  {getStatusIcon(result.checks.database.status)}
                  <p className="font-medium">Database</p>
                </div>
                <p className="text-sm text-muted-foreground">{result.checks.database.message}</p>
                {result.checks.database.latency !== undefined && (
                  <p className="text-xs text-muted-foreground">
                    Latency: {result.checks.database.latency}ms
                  </p>
                )}
              </div>
              <Badge className={getStatusColor(result.checks.database.status)} variant="outline">
                {result.checks.database.status}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* VectorDB */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  {getStatusIcon(result.checks.vectordb.status)}
                  <p className="font-medium">VectorDB</p>
                </div>
                <p className="text-sm text-muted-foreground">{result.checks.vectordb.message}</p>
                {result.checks.vectordb.details?.collectionCount !== undefined && (
                  <p className="text-xs text-muted-foreground">
                    Collections: {result.checks.vectordb.details.collectionCount}
                  </p>
                )}
                {result.checks.vectordb.latency !== undefined && (
                  <p className="text-xs text-muted-foreground">
                    Latency: {result.checks.vectordb.latency}ms
                  </p>
                )}
              </div>
              <Badge className={getStatusColor(result.checks.vectordb.status)} variant="outline">
                {result.checks.vectordb.status}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* MCP Tools */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  {getStatusIcon(result.checks.mcpTools.status)}
                  <p className="font-medium">MCP Tools</p>
                </div>
                <p className="text-sm text-muted-foreground">{result.checks.mcpTools.message}</p>
                {result.checks.mcpTools.details?.serverCount !== undefined && (
                  <p className="text-xs text-muted-foreground">
                    Servers: {result.checks.mcpTools.details.connectedCount}/
                    {result.checks.mcpTools.details.serverCount}
                  </p>
                )}
                {result.checks.mcpTools.latency !== undefined && (
                  <p className="text-xs text-muted-foreground">
                    Latency: {result.checks.mcpTools.latency}ms
                  </p>
                )}
              </div>
              <Badge className={getStatusColor(result.checks.mcpTools.status)} variant="outline">
                {result.checks.mcpTools.status}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* LLM Providers */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  {getStatusIcon(result.checks.llmProviders.status)}
                  <p className="font-medium">LLM Providers</p>
                </div>
                <p className="text-sm text-muted-foreground">
                  {result.checks.llmProviders.message}
                </p>
                {result.checks.llmProviders.details?.configuredCount !== undefined && (
                  <p className="text-xs text-muted-foreground">
                    Configured: {result.checks.llmProviders.details.configuredCount}/
                    {result.checks.llmProviders.details.totalProviders}
                  </p>
                )}
                {result.checks.llmProviders.latency !== undefined && (
                  <p className="text-xs text-muted-foreground">
                    Latency: {result.checks.llmProviders.latency}ms
                  </p>
                )}
              </div>
              <Badge
                className={getStatusColor(result.checks.llmProviders.status)}
                variant="outline"
              >
                {result.checks.llmProviders.status}
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
