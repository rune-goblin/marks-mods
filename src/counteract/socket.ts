import { MODULE_ID } from '@/constants';
import { CounteractReviewApp } from '@/ui/CounteractReviewApp';
import { warn, type Approval, type CounteractRequest, type Reply } from './counteract';

const CHANNEL = `module.${MODULE_ID}`;

type SocketMessage =
  | { type: 'request'; request: CounteractRequest }
  | { type: 'cancel'; requestId: string }
  | { type: 'approve'; requestId: string; approval: Approval }
  | { type: 'refuse'; requestId: string };

export interface PendingRequest {
  reply: Promise<Reply>;
  cancel(): void;
}

interface Waiting {
  gmId: string;
  resolve: (reply: Reply) => void;
}

const waiting = new Map<string, Waiting>();

function emit(message: SocketMessage, recipient: string): void {
  game.socket.emit(CHANNEL, message, { recipients: [recipient] });
}

function settle(requestId: string, reply: Reply): void {
  const entry = waiting.get(requestId);
  waiting.delete(requestId);
  entry?.resolve(reply);
}

function wait(requestId: string, gmId: string): Promise<Reply> {
  return new Promise<Reply>((resolve) => waiting.set(requestId, { gmId, resolve }));
}

function toReply(approval: Approval | null): Reply {
  return approval ? { type: 'approve', approval } : { type: 'refuse' };
}

/** A GM roller reviews the request itself; anyone else asks the active GM and waits. */
export function sendRequest(request: CounteractRequest): PendingRequest | null {
  const { requestId } = request;
  if (game.user.isGM) {
    const reply = wait(requestId, game.user.id);
    CounteractReviewApp.open(request, (approval) => settle(requestId, toReply(approval)));
    return {
      reply,
      cancel: () => {
        CounteractReviewApp.dismiss(requestId, request.userId);
        settle(requestId, { type: 'cancel' });
      },
    };
  }

  const gm = game.users.activeGM;
  if (!gm) {
    warn('noGM');
    return null;
  }
  const reply = wait(requestId, gm.id);
  emit({ type: 'request', request }, gm.id);
  return {
    reply,
    cancel: () => {
      if (!waiting.has(requestId)) return;
      emit({ type: 'cancel', requestId }, gm.id);
      settle(requestId, { type: 'cancel' });
    },
  };
}

function onMessage(message: SocketMessage, senderId: string): void {
  switch (message.type) {
    case 'request': {
      const { request } = message;
      if (!game.users.activeGM?.isSelf || request.userId !== senderId) return;
      CounteractReviewApp.open(request, (approval) => {
        const { requestId } = request;
        emit(approval ? { type: 'approve', requestId, approval } : { type: 'refuse', requestId }, request.userId);
      });
      return;
    }
    case 'cancel':
      CounteractReviewApp.dismiss(message.requestId, senderId);
      return;
    case 'approve':
    case 'refuse':
      if (!game.users.get(senderId)?.isGM) return;
      settle(message.requestId, toReply(message.type === 'approve' ? message.approval : null));
  }
}

// A client that reloads or drops never closes its windows, so nothing answers for it.
function onUserConnected(user: User, connected: boolean): void {
  if (connected) return;
  CounteractReviewApp.dismissFor(user.id);
  for (const [requestId, { gmId }] of waiting) {
    if (gmId !== user.id) continue;
    settle(requestId, { type: 'cancel' });
    warn('gmLeft');
  }
}

export function registerSocket(): void {
  Hooks.once('ready', () => {
    game.socket.on(CHANNEL, onMessage);
  });
  Hooks.on('userConnected', onUserConnected);
}
