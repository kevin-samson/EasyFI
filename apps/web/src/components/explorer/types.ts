import type { ChatBlock, ExplorerThreadList } from '@easyfi/contracts';

/** Structured blocks an Explorer answer can carry (from /api/v1). Weights are fractions 0–1. */
export type {
  ChatBlock,
  ChatMessage as ApiChatMessage,
  ExplorerStreamEvent,
  ExplorerThread,
} from '@easyfi/contracts';
export type TableBlock = Extract<ChatBlock, { type: 'table' }>;
export type SectorShiftBlock = Extract<ChatBlock, { type: 'sector_shift' }>;
export type ThreadSummary = ExplorerThreadList['threads'][number];
export type ExplorerUsage = ExplorerThreadList['usage'];

export type UserMessage = { id: string; role: 'user'; text: string };
export type AssistantMessage = {
  id: string;
  role: 'assistant';
  text: string;
  blocks: ChatBlock[];
  /** True while the answer is still streaming in. */
  pending?: boolean;
  /** Tool currently running while pending (drives the "Looking through…" status). */
  tool?: string;
  /** Set when the answer failed (stream error event or network failure). */
  error?: { code: string; message: string };
};
export type ChatMessage = UserMessage | AssistantMessage;
