import { NextRequest, NextResponse } from 'next/server';
import { GraphFactory } from '@/lib/langgraph';
import type { GraphConfig } from '@/lib/langgraph/types';
import type { Message } from '@/types';

/**
 * POST /api/chat/stream
 *
 * Streams LangGraph responses to the client.
 * This API route runs on the server side where Node.js modules like @langchain/langgraph are available.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { graphConfig, messages } = body as {
      graphConfig: GraphConfig;
      messages: Message[];
    };

    // Validate input
    if (!graphConfig || !messages) {
      return NextResponse.json(
        { error: 'Missing graphConfig or messages' },
        { status: 400 }
      );
    }

    // Create a TransformStream for streaming response
    const encoder = new TextEncoder();
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

    // Start streaming in the background
    (async () => {
      try {
        for await (const event of GraphFactory.streamWithConfig(graphConfig, messages)) {
          // Send each event as a JSON line
          const data = JSON.stringify(event) + '\n';
          await writer.write(encoder.encode(data));
        }
      } catch (error: any) {
        console.error('[API] Stream error:', error);
        // Send error event
        const errorEvent = {
          type: 'error',
          error: error.message || 'Stream failed',
        };
        const data = JSON.stringify(errorEvent) + '\n';
        await writer.write(encoder.encode(data));
      } finally {
        await writer.close();
      }
    })();

    // Return streaming response
    return new NextResponse(stream.readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
      },
    });
  } catch (error: any) {
    console.error('[API] Request error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process request' },
      { status: 500 }
    );
  }
}
