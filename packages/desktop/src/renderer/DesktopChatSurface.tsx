import React from 'react'
import type { DesktopChatSurfaceModel } from './desktop-chat'
import { ActivityMonitor } from './ActivityMonitor'
import { ChatComposer } from './ChatComposer'
import { ChatHeader } from './ChatHeader'
import { ChatTranscript } from './ChatTranscript'

interface DesktopChatSurfaceProps {
  model: DesktopChatSurfaceModel
}

export function DesktopChatSurface({
  model,
}: DesktopChatSurfaceProps) {
  return (
    <div
      className="chat-container"
      onDragOver={model.onDragOver}
      onDragLeave={model.onDragLeave}
      onDrop={model.onDrop}
    >
      {model.isDragOver && (
        <div className="drop-overlay">
          <div className="drop-overlay-text">Drop files or text here</div>
        </div>
      )}

      <div className="chat-body">
        <div className="chat-main">
          <ChatHeader model={model.header} />
          <ChatTranscript model={model.transcript} />
          <ChatComposer model={model.composer} />
        </div>

        <ActivityMonitor model={model.monitor} />
      </div>
    </div>
  )
}
