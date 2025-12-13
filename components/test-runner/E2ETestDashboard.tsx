'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Beaker, Play, MessageSquare, Image as ImageIcon, Box } from 'lucide-react';
import { TEST_SCENARIOS, TestScenario } from './scenarios';
import { ScenarioRunner } from './ScenarioRunner';
import { Badge } from '@/components/ui/badge';

/**
 * E2E Test Dashboard 컴포넌트
 */
export function E2ETestDashboard() {
  const [selectedScenario, setSelectedScenario] = useState<TestScenario | null>(null);

  const getCategoryIcon = (category: TestScenario['category']) => {
    switch (category) {
      case 'llm':
        return <MessageSquare className="w-5 h-5 text-blue-500" />;
      case 'multimodal':
        return <ImageIcon className="w-5 h-5 text-purple-500" />;
      case 'ui':
        return <Box className="w-5 h-5 text-orange-500" />;
      default:
        return <Beaker className="w-5 h-5 text-gray-500" />;
    }
  };

  return (
    <div className="container mx-auto p-6 space-y-6 h-screen flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              window.location.href = '/';
            }}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Main App
          </Button>
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <Beaker className="w-8 h-8" />
              E2E Interaction Tests
            </h1>
            <p className="text-muted-foreground">실제 UI 시나리오 기반 테스트</p>
          </div>
        </div>
        <div>
          <Button variant="outline" onClick={() => (window.location.href = '/test-dashboard')}>
            Go to Unit Test Dashboard
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 min-h-0">
        {selectedScenario ? (
          <ScenarioRunner scenario={selectedScenario} onClose={() => setSelectedScenario(null)} />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {TEST_SCENARIOS.map((scenario) => (
              <Card
                key={scenario.id}
                className="hover:shadow-lg transition-all cursor-pointer group"
                onClick={() => setSelectedScenario(scenario)}
              >
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      {getCategoryIcon(scenario.category)}
                      {scenario.title}
                    </CardTitle>
                    <Badge variant="secondary" className="uppercase text-xs">
                      {scenario.category}
                    </Badge>
                  </div>
                  <CardDescription className="line-clamp-2">{scenario.description}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-md">
                      <span className="font-semibold block mb-1">Steps:</span>
                      <ul className="list-disc list-inside space-y-1">
                        {scenario.steps.slice(0, 3).map((step, idx) => (
                          <li key={idx} className="truncate">
                            {step.description}
                          </li>
                        ))}
                        {scenario.steps.length > 3 && (
                          <li>...and {scenario.steps.length - 3} more</li>
                        )}
                      </ul>
                    </div>
                    <Button className="w-full group-hover:bg-primary/90">
                      <Play className="w-4 h-4 mr-2" />
                      Select Scenario
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
