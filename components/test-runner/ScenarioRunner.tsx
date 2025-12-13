'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TestScenario, TestStep } from './scenarios';
import { Play, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
// Mock Chat Components for visual feedback
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface ScenarioRunnerProps {
  scenario: TestScenario;
  onClose: () => void;
}

interface StepStatus {
  stepId: string;
  status: 'pending' | 'running' | 'success' | 'failure';
  message?: string;
}

interface MockMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export function ScenarioRunner({ scenario, onClose }: ScenarioRunnerProps) {
  // const [currentStepIndex, setCurrentStepIndex] = useState(0); // Unused
  const [stepStatuses, setStepStatuses] = useState<StepStatus[]>(
    scenario.steps.map((s) => ({ stepId: s.id, status: 'pending' }))
  );
  const [isRunning, setIsRunning] = useState(false);
  const [messages, setMessages] = useState<MockMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const updateStepStatus = (index: number, status: StepStatus['status'], message?: string) => {
    setStepStatuses((prev) => {
      const newStats = [...prev];
      newStats[index] = { ...newStats[index], status, message };
      return newStats;
    });
  };

  const runScenario = async () => {
    setIsRunning(true);
    // setCurrentStepIndex(0);
    setMessages([]); // Clear chat

    // Reset statuses
    setStepStatuses(scenario.steps.map((s) => ({ stepId: s.id, status: 'pending' })));

    for (let i = 0; i < scenario.steps.length; i++) {
      const step = scenario.steps[i];
      // setCurrentStepIndex(i);
      updateStepStatus(i, 'running');

      try {
        await executeStep(step);
        updateStepStatus(i, 'success');
      } catch (error) {
        updateStepStatus(i, 'failure', error instanceof Error ? error.message : 'Unknown error');
        setIsRunning(false);
        return; // Stop on failure
      }

      // Allow some visual delay between steps
      await new Promise((resolve) => setTimeout(resolve, 800));
    }

    setIsRunning(false);
  };

  const executeStep = async (step: TestStep) => {
    switch (step.type) {
      case 'input':
        if (step.inputValue) {
          // Simulate Typing
          setMessages((prev) => [
            ...prev,
            { id: `msg-${Date.now()}`, role: 'user', content: step.inputValue! },
          ]);
        }
        break;

      case 'action':
        if (step.action === 'submit') {
          // In a real e2e, this would trigger the backend.
          // Here we need to simulate calling the LLM or actually call it via electronAPI if we want "Real" integration.
          // For E2E Dashboard, let's try to actually invoke the LLM via electronAPI if available,
          // or mock it if we just want to test the harness.
          // The user requested "actually test UI interaction", but we are in a separate dashboard.
          // We can invoke the `llm.chat` API and display the result in our mock UI.

          await performRealLLMCall();
        }
        break;

      case 'wait':
        // Wait is handled implicitly by the await in 'action' for LLM call,
        // but if we had explicit wait step:
        await new Promise((resolve) => setTimeout(resolve, 2000));
        break;

      case 'assertion':
        {
          // Check the last message from assistant
          const lastMsg = messages[messages.length - 1];
          if (!lastMsg || lastMsg.role !== 'assistant') {
            throw new Error('No response received from assistant');
          }

          if (step.assertionType === 'exists') {
            if (!lastMsg.content) {
              throw new Error('Response content matches empty');
            }
          } else if (step.assertionType === 'contains' && step.expected) {
            if (step.expected === 'img') {
              // Special handling for image check - checking if content has markdown image syntax
              if (!lastMsg.content.includes('![') && !lastMsg.content.includes('<img')) {
                throw new Error('Response does not contain an image');
              }
            } else {
              // Text check
              if (!lastMsg.content.includes(step.expected.toString())) {
                throw new Error(`Response does not contain expected text: "${step.expected}"`);
              }
            }
          }
        }
        break;
    }
  };

  const performRealLLMCall = async () => {
    // Get the last user message
    const lastUserMsg = messages[messages.length - 1];
    if (!lastUserMsg) {
      return;
    }

    if (!window.electronAPI) {
      // Fallback for browser-only dev
      await new Promise((resolve) => setTimeout(resolve, 1000));
      setMessages((prev) => [
        ...prev,
        {
          id: `res-${Date.now()}`,
          role: 'assistant',
          content: 'This is a mock response because electronAPI is missing.',
        },
      ]);
      return;
    }

    try {
      // Use streaming chat for better realism
      // Note: We need to construct the message history correctly.
      const history = messages.map((m) => ({
        role: m.role,
        content: m.content,
        id: m.id,
        created_at: Date.now(),
      }));

      // Add a temporary empty message for streaming
      const responseId = `res-${Date.now()}`;
      setMessages((prev) => [...prev, { id: responseId, role: 'assistant', content: '' }]);

      // We'll use a simple accumulated string for now
      let fullResponse = '';

      // Setup listener
      const cleanup = window.electronAPI.llm.onStreamChunk((chunk) => {
        fullResponse += chunk;
        setMessages((prev) =>
          prev.map((m) => (m.id === responseId ? { ...m, content: fullResponse } : m))
        );
      });

      // Call API
      await window.electronAPI.llm.streamChat(history);

      // Cleanup listener is tricky here because streamChat is promise that resolves when done?
      // Usually streamChat resolves when stream starts or finishes depending on implementation.
      // Based on preload.ts, invoke returns promise.
      // And we have onStreamDone.

      await new Promise<void>((resolve) => {
        const removeDoneListener = window.electronAPI.llm.onStreamDone(() => {
          cleanup(); // remove chunk listener
          // remove done listener - tricky without stored ref, but useEffect cleanup handles component unmount.
          // Here we just resolve.
          resolve();
          removeDoneListener(); // Remove the done listener itself
        });
        // Also handle error
      });
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { id: `err-${Date.now()}`, role: 'assistant', content: `Error calling LLM: ${error}` },
      ]);
      throw error;
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 h-[600px]">
      {/* Control & Steps Panel */}
      <Card className="flex flex-col">
        <CardHeader>
          <CardTitle>{scenario.title}</CardTitle>
          <CardDescription>{scenario.description}</CardDescription>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col min-h-0 space-y-4">
          <div className="flex gap-2">
            <Button onClick={runScenario} disabled={isRunning} className="w-full">
              {isRunning ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Play className="w-4 h-4 mr-2" />
              )}
              {isRunning ? 'Running...' : 'Start Scenario'}
            </Button>
            <Button variant="outline" onClick={onClose} disabled={isRunning}>
              Back
            </Button>
          </div>

          <ScrollArea className="flex-1 border rounded-md p-4">
            <div className="space-y-4">
              {scenario.steps.map((step, index) => {
                const status = stepStatuses[index];
                return (
                  <div
                    key={step.id}
                    className={cn(
                      'flex items-start gap-3 p-3 rounded-lg border',
                      status.status === 'running' && 'bg-blue-50 border-blue-200',
                      status.status === 'success' && 'bg-green-50 border-green-200',
                      status.status === 'failure' && 'bg-red-50 border-red-200',
                      status.status === 'pending' && 'bg-gray-50 text-gray-400'
                    )}
                  >
                    <div className="mt-0.5">
                      {status.status === 'pending' && (
                        <div className="w-4 h-4 rounded-full border-2 border-gray-300" />
                      )}
                      {status.status === 'running' && (
                        <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                      )}
                      {status.status === 'success' && (
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                      )}
                      {status.status === 'failure' && <XCircle className="w-4 h-4 text-red-500" />}
                    </div>
                    <div className="flex-1 text-sm">
                      <p className="font-medium text-foreground">{step.description}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Type: <span className="uppercase">{step.type}</span>
                        {step.inputValue && ` | Input: "${step.inputValue}"`}
                        {step.expected && ` | Expect: "${step.expected}"`}
                      </p>
                      {status.message && (
                        <p className="text-xs text-red-500 mt-1 font-medium">{status.message}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Visual Feedback Panel (Mock Chat) */}
      <Card className="flex flex-col overflow-hidden bg-slate-50 dark:bg-slate-900 border-2 border-dashed">
        <div className="p-3 border-b bg-background/50 flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground">
            VIRTUAL CHAT ENVIRONMENT
          </span>
          {isRunning && (
            <span className="flex items-center gap-1.5 text-xs text-green-600 animate-pulse">
              <div className="w-2 h-2 rounded-full bg-green-500" /> LIVE
            </span>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4" ref={scrollRef}>
          {messages.length === 0 && (
            <div className="h-full flex flex-col items-center justify-center text-muted-foreground opacity-50">
              <Play className="w-12 h-12 mb-2" />
              <p>Ready to start scenario</p>
            </div>
          )}
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                'flex gap-3 max-w-[85%]',
                msg.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'
              )}
            >
              <Avatar className="w-8 h-8 shrink-0">
                <AvatarFallback>{msg.role === 'user' ? 'U' : 'AI'}</AvatarFallback>
                {msg.role === 'assistant' && <AvatarImage src="/bot-avatar.png" />}
              </Avatar>
              <div
                className={cn(
                  'p-3 rounded-lg text-sm',
                  msg.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-white dark:bg-slate-800 border shadow-sm'
                )}
              >
                <p className="whitespace-pre-wrap">
                  {msg.content || <span className="animate-pulse">...</span>}
                </p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
