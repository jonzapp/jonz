import {
  thinkingSteps,
  CHAT_FULL,
  CHAT_LONG_AT,
  starterDraft,
  type GroupDef,
  type KindDef,
  type HouseRules,
  type JohnDef,
  type SavedTurn,
  type StarterKind,
} from '@app/core';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';

import { type SavedChat } from '@/api/ask-chats';
import { applyDraft } from '@/api/draft';
import { usageState } from '@/components/chat/ask-usage';
import { ChatLog, UserBubble } from '@/components/chat/chat';
import { NO_PIECES, type ReplyPieces } from '@/components/reply/reply';
import { Thinking } from '@/components/house/thinking';
import { useAskUsage } from '@/hooks/use-ask-usage';
import { useMove } from '@/hooks/use-move';
import { useWords } from '@/hooks/use-words';
import { ChatFoot, DoneTurn, Greeting, JonzTurn, placeholderFor, SummedLine } from './setup-chat-parts';
import { askJonz, useDrafting, useKeptChat } from './setup-chat-state';
import { AskCard, DraftCard } from './setup-chat-cards';
import { carriedChat, fromSaved, Person, summedOf, summedTurn, Turn, withLine } from './setup-chat-turns';

interface SetupChatProps {
  houseId: string;
  rules: HouseRules;
  /** The house's list as it stands: empty for a new house, which the chat sets up; otherwise the chat changes it. */
  johns: JohnDef[];
  /** The house's groups already, so a drafted group with the same name is used as it is. */
  groups: GroupDef[];
  /** The house's kinds, so a John's kind is read by name. */
  kinds?: readonly KindDef[];
  people: Person[];
  me: string;
  /** Whether the House Pass's extras are open to this house: changing a list with Jonz is one. */
  passOpen: boolean;
  /** Whether this person may change the list (an admin, a parent). Without it, Jonz answers questions and drafts nothing. */
  canChange?: boolean;
  /** The done row's way to the John list: back down the stack on a page, across to it from the side panel. */
  onOpenList?: () => void;
  /** What Jonz's replies' chips and cards stand for (components/reply/pieces.tsx); without it they're words. */
  pieces?: ReplyPieces;
  /** A chat kept earlier, to carry on with; none starts a new one. Remount (a new key) to switch. */
  saved?: SavedChat | null;
  /** A new chat's first turns: the line from a full chat it carries on from (carriedChat). */
  seed?: readonly SavedTurn[];
  /** The chat is kept, under this id: after each answer, so it's never lost. */
  onKept?: (id: string) => void;
  /** Whether there's anything in the chat yet (said, or being written): New chat has nothing to clear until there is. */
  onTalked?: (talked: boolean) => void;
  /** Carry on in a new chat, opening with these turns (a long chat's summary): a full chat's way on. */
  onCarryOn?: (seed: SavedTurn[]) => void;
}

/**
 * Describe your house, as a chat: Jonz asks, the admin answers in words or
 * by tapping a quick answer or a day, and the draft list shows in the chat
 * as a card, every John ticked. Each message after that changes the draft
 * ("oven every month"); the card opens into the whole list, and the amber
 * button adds the ticked Johns (making any groups they need). Nothing is
 * written before that. The cards are the app's own rows, buttons and day
 * picker, so the draft looks as the list will.
 */
export function SetupChat({
  houseId,
  rules,
  johns,
  groups,
  kinds,
  people,
  me,
  passOpen,
  canChange = true,
  onOpenList = () => router.dismissTo('/house/johns'),
  pieces = NO_PIECES,
  saved = null,
  seed,
  onKept,
  onTalked,
  onCarryOn,
}: SetupChatProps) {
  const words = useWords();
  const keeping = useMove(houseId);
  const { base, editing, draft, keep, card, drafted, applied, changes } = useDrafting(johns, groups, kinds);
  const [turns, setTurns] = useState<Turn[]>(() => fromSaved(saved?.turns ?? seed ?? []));
  const kept = useKeptChat(houseId, turns, { saved, onKept });
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const usage = useAskUsage(houseId);
  const week = usageState(usage.data);
  // A long chat: from CHAT_LONG_AT turns it says so; at CHAT_FULL it carries on in a new one.
  const full = turns.length >= CHAT_FULL;
  const long = turns.length >= CHAT_LONG_AT;
  const summed = summedOf(turns);

  // A new house's chat ends once its first list is in (the deal question follows); a list's chat carries on.
  const done = !editing && turns.some((t) => t.role === 'done');
  const busy = sending || keeping.pending;
  const talked = turns.length > 0 || text.trim() !== '';
  useEffect(() => onTalked?.(talked), [talked, onTalked]);
  // The draft card sits under the turn that last changed the draft; only Jonz's last question can be answered.
  const draftAt = turns.findLastIndex((t) => t.role === 'assistant' && t.draft !== null);
  const last = turns.at(-1);
  const ask = !busy && last?.role === 'assistant' ? last.ask : null;
  // What Jonz shows itself doing while it answers: "your list" once there's a draft or a list to look at.
  const steps = thinkingSteps(draft !== null, words);

  function answered(reply: Turn & { role: 'assistant' }, said: Turn[]) {
    kept.changed();
    setTurns([...said, reply]);
    if (reply.draft) drafted(reply.draft);
  }

  async function send(text: string) {
    const said = text.trim();
    if (!said || busy || done) return;
    const before = turns;
    const next: Turn[] = [...turns, { role: 'user', text: said }];
    kept.wrote();
    setTurns(next);
    setText('');
    setProblem(null);
    setSending(true);
    try {
      const { reply, allowance } = await askJonz(houseId, next, { draft, steps, words });
      if (allowance) usage.put(allowance);
      answered(reply, next);
    } catch (reason) {
      // Refused (too many today, say): what was said goes back in the box to try again.
      setTurns(before);
      setText(said);
      setProblem(reason instanceof Error ? reason.message : String(reason));
      // Used up while they wrote: the box gives way to the notice.
      void usage.refetch();
    } finally {
      setSending(false);
    }
  }

  function pick(kind: StarterKind) {
    const said: Turn[] = [...turns, { role: 'user', text: words(`ask.draft.starter.${kind}.title` as const) }];
    answered({ role: 'assistant', text: words('ask.draft.fromStarter'), ask: null, draft: starterDraft(kind) }, said);
  }

  async function add() {
    if (!draft) return;
    let added = 0;
    if (await keeping.run(async () => (added = await applyDraft({ houseId, rules, list: { johns, groups }, now: new Date() }, { base, draft, keys: keep })))) {
      kept.changed();
      setTurns((was) => [...was, { role: 'done', added }]);
      applied();
    }
  }

  const gated = editing && !passOpen;
  const house = {
    id: houseId,
    me,
    nameOf: (id: string) => (id === me ? 'You' : (people.find((p) => p.userId === id)?.name ?? 'Someone')),
    currency: rules.currency,
    zone: rules.timezone,
  };
  const placeholder = placeholderFor({ canChange, editing, fresh: turns.length === 0, drafting: draft !== null }, words);

  return (
    <ChatLog
      foot={
        done ? null : (
          <ChatFoot
            stop={gated ? 'pass' : week === 'out' && usage.data ? 'out' : full ? 'full' : null}
            warn={week === 'low' && usage.data ? 'low' : long ? 'long' : null}
            usage={usage.data}
            zone={rules.timezone}
            onCarryOn={() => onCarryOn?.(carriedChat(turns, words))}
            box={{ value: text, onChangeText: setText, onSend: () => void send(text), busy, placeholder, problem }}
          />
        )
      }
    >
      <Greeting canChange={canChange} editing={editing} fresh={turns.length === 0} closed={gated || week === 'out'} onAsk={(question) => void send(question)} onPick={pick} />

      {/* The line where Jonz summed up the chat goes over the first turn it doesn't stand for. */}
      {withLine(
        turns.map((turn, at) => {
          if (turn.role === 'user') return <UserBubble key={at} text={turn.text} />;
          if (turn.role === 'done') return <DoneTurn key={at} added={turn.added} editing={editing} onOpenList={onOpenList} askMode={editing ? null : { houseId, start: rules.dealMode }} />;
          return (
            <JonzTurn key={at} turn={turn} pieces={pieces} house={house}>
              {/* The question's answers sit under the question, over the draft it's about. */}
              {turn === last && ask ? <AskCard ask={ask} weekStarts={rules.weekStarts} onAnswer={(a) => void send(a)} /> : null}
              {/* A turn that changes nothing on a house's list (a question, say) has no card. */}
              {at === draftAt && draft && (!editing || changes > 0) ? (
                <DraftCard {...card} draft={draft} onKeep={() => void add()} pending={keeping.pending} problem={keeping.problem} people={people} me={me} />
              ) : null}
            </JonzTurn>
          );
        }),
        summedTurn(turns, summed),
        summed ? <SummedLine key="summed" summed={summed} /> : null,
      )}

      {sending ? <Thinking steps={steps} /> : null}
    </ChatLog>
  );
}
