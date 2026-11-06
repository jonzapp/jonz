import { OwnerAsk, type OwnerTurn } from '@/components/admin/owner-ask';

/**
 * The owner's Ask Jonz with a sample chat, for /style/owner: the Inbox, an
 * account waiting to be deleted, and words for a notice, each with the
 * owner's own chips. Nothing is sent from here unless you type.
 */
const TURNS: OwnerTurn[] = [
  { role: 'user', text: 'Anything waiting in the inbox?' },
  {
    role: 'assistant',
    thought: { seconds: 3, steps: ['Reading the admin pages', 'Looking it up'] },
    text: [
      '**3 reports** are waiting, newest first:',
      '',
      '1. [Ticks not saving on Android](jonz:report/5f1c2a90-1111-4000-8000-000000000001) from Sam at Elm Road, this morning',
      '2. [A dark app icon](jonz:report/5f1c2a90-1111-4000-8000-000000000002) from Priya, yesterday',
      '3. [How do I leave a house?](jonz:report/5f1c2a90-1111-4000-8000-000000000003) from Tom, on Monday',
      '',
      'The first is a problem and two people in the same house have said it. Reply from the [Inbox](jonz:admin/inbox).',
    ].join('\n'),
  },
  { role: 'user', text: 'Who asked to be deleted this week?' },
  {
    role: 'assistant',
    thought: { seconds: 2, steps: ['Reading the admin pages'] },
    text: [
      'One account: [Tom Reed](jonz:account/7a9e0c14-2222-4000-8000-000000000004) asked on Tuesday, and it goes on **2 December** unless he changes his mind.',
      '',
      'The request is [in the audit log](jonz:audit/1042). To stop it or delete it now, use [Deletions](jonz:admin/deletions).',
    ].join('\n'),
  },
  { role: 'user', text: 'Write a notice about the Android bug' },
  {
    role: 'assistant',
    thought: { seconds: 4, steps: ['Reading the admin pages', 'Looking it up', 'Writing it down'] },
    text: [
      'Here are words for a **Something’s wrong** notice:',
      '',
      '> **Ticks on Android**',
      '> Some ticks on Android aren’t saving. We’re on it. Tick again later, or use jonz.app.',
      '',
      'Put it up from [Notices](jonz:admin/notices), with your code. I can’t post it myself.',
    ].join('\n'),
  },
];

export function OwnerAskSample() {
  return <OwnerAsk turns={TURNS} />;
}
