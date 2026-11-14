// The house style's lint rules (jonz.js, docs/style/): each catches what it
// should and leaves the shared kit's way alone. Run with node's own test
// runner (`npm test` does), since Jest's Expo preset can't host ESLint.
const { describe, it } = require('node:test');
const { RuleTester } = require('eslint');
const tsParser = require('@typescript-eslint/parser');

const jonz = require('./jonz');

RuleTester.describe = describe;
RuleTester.it = it;

const tester = new RuleTester({
  languageOptions: { parser: tsParser, parserOptions: { ecmaFeatures: { jsx: true } } },
});

describe('refuses a colour written by hand', () => {
  tester.run('no-raw-colour', jonz.rules['no-raw-colour'], {
    valid: ["const s = { color: colors.foreground, backgroundColor: 'transparent' };"],
    invalid: [
      { code: "const s = { backgroundColor: '#f6b800' };", errors: [{ messageId: 'raw' }] },
      { code: "const s = { borderColor: 'rgba(0,0,0,0.1)' };", errors: [{ messageId: 'raw' }] },
      { code: 'const x = <Icon color="white" />;', errors: [{ messageId: 'raw' }] },
    ],
  });
});

describe('refuses a text size written by hand', () => {
  tester.run('no-raw-type-size', jonz.rules['no-raw-type-size'], {
    valid: ['const s = { ...type.body, lineHeight: type.body.lineHeight };'],
    invalid: [{ code: 'const s = { fontSize: 13 };', errors: [{ messageId: 'raw' }] }],
  });
});

describe('refuses spacing and corners written by hand', () => {
  tester.run('spacing-from-scale', jonz.rules['spacing-from-scale'], {
    valid: ['const s = { padding: SPACE.md, marginTop: 0, gap: SPACE.sm, borderRadius: RADIUS };'],
    invalid: [
      { code: 'const s = { paddingHorizontal: 10 };', errors: [{ messageId: 'space' }] },
      { code: 'const s = { marginLeft: -6 };', errors: [{ messageId: 'space' }] },
      { code: 'const s = { borderRadius: 6 };', errors: [{ messageId: 'radius' }] },
    ],
  });
});

describe('sends buttons side by side to a ButtonRow', () => {
  tester.run('no-hand-made-button-row', jonz.rules['no-hand-made-button-row'], {
    valid: [
      'const x = <ButtonRow><Button label="a" /><Button label="b" /></ButtonRow>;',
      // A column of buttons is fine.
      'const x = <View style={styles.stack}><Button label="a" /><Button label="b" /></View>; const styles = { stack: { gap: 8 } };',
      // Arrows either side of a month's name are icon buttons, not a row of buttons.
      'const x = <View style={{ flexDirection: \'row\' }}><IconButton label="a" /><Text>Nov</Text><IconButton label="b" /></View>;',
    ],
    invalid: [
      {
        code: 'const x = <View style={{ flexDirection: \'row\' }}><Button label="a" /><Button label="b" /></View>;',
        errors: [{ messageId: 'row' }],
      },
      {
        // The old hand-made pair: each button in a flex: 1 half.
        code: 'const x = <View style={styles.pair}><View style={styles.half}><Button label="a" /></View><View style={styles.half}><Button label="b" /></View></View>;\nconst styles = StyleSheet.create({ pair: { flexDirection: \'row\', gap: 8 }, half: { flex: 1 } });',
        errors: [{ messageId: 'row' }],
      },
    ],
  });
});

describe('places every button with a ButtonRow', () => {
  tester.run('button-in-row', jonz.rules['button-in-row'], {
    valid: [
      'const x = <ButtonRow><Button label="Deal week 1" /></ButtonRow>;',
      'const x = <View><ButtonRow stacked>{a ? <Button label="a" /> : null}<Button label="b" /></ButtonRow></View>;',
      // An icon alone is a square wherever it sits.
      'const x = <View><Button label="Photo" iconOnly /></View>;',
      // Handed to a component that places it (EmptyState's action, a row's trailing slot).
      'const x = <EmptyState action={<Button label="a" />} />;',
      'const x = <Sheet><Button label="a" /></Sheet>;',
    ],
    invalid: [
      {
        // Week's Deal button before: at its own width on a phone.
        code: "const x = <View style={styles.start}><Button label=\"Deal week 1\" /></View>;",
        errors: [{ messageId: 'loose' }],
      },
      {
        code: 'const x = <View>{a ? <Button label="a" /> : null}<>{b && <Button label="b" />}</></View>;',
        errors: [{ messageId: 'loose' }, { messageId: 'loose' }],
      },
    ],
  });
});

describe('keeps hand-made pressables out of screens', () => {
  tester.run('no-pressable-in-screens', jonz.rules['no-pressable-in-screens'], {
    valid: [{ code: "import { Pressable } from 'react-native';", filename: '/repo/apps/client/src/components/row.tsx' }],
    invalid: [
      {
        code: "import { Pressable } from 'react-native';",
        filename: '/repo/apps/client/src/app/(house)/today.tsx',
        errors: [{ messageId: 'screen' }],
      },
    ],
  });
});

describe('shows an outline or a busy button while waiting, not a spinner alone', () => {
  tester.run('no-bare-spinner', jonz.rules['no-bare-spinner'], {
    valid: [
      { code: "import { ActivityIndicator } from 'react-native';", filename: '/repo/apps/client/src/components/button.tsx' },
      { code: "import { ActivityIndicator } from 'react-native';", filename: '/repo/apps/client/src/components/list-foot.tsx' },
      { code: "import { ActivityIndicator } from 'react-native';", filename: '/repo/apps/client/src/components/admin/smart-search.tsx' },
      { code: "import { ReadFailed } from '@/components/read-state';", filename: '/repo/apps/client/src/app/(tabs)/today.tsx' },
      { code: "import { Waiting } from '@/components/waiting';", filename: '/repo/apps/client/src/app/(tabs)/today.tsx' },
    ],
    invalid: [
      {
        code: "import { ActivityIndicator, View } from 'react-native';",
        filename: '/repo/apps/client/src/components/admin/house-panel.tsx',
        errors: [{ messageId: 'spinner' }],
      },
      // An icon button is not the Button.
      { code: "import { ActivityIndicator } from 'react-native';", filename: '/repo/apps/client/src/components/icon-button.tsx', errors: [{ messageId: 'spinner' }] },
    ],
  });
});

describe('makes a button waiting on the server busy, not pale', () => {
  tester.run('busy-not-disabled', jonz.rules['busy-not-disabled'], {
    valid: [
      'const x = <Button label="Leave" busy={leave.isPending} busyLabel="Leaving" />;',
      // Switched off for a reason that isn't a wait.
      'const x = <Button label="Save" disabled={!name.trim()} />;',
      'const x = <TickBox state="open" disabled={busy} />;',
    ],
    invalid: [
      { code: 'const x = <Button label="Leave" disabled={leave.isPending} />;', errors: [{ messageId: 'busy' }] },
      { code: 'const x = <Button label="Send" disabled={!text || sending} />;', errors: [{ messageId: 'busy' }] },
    ],
  });
});

describe("keeps the owner's pieces on the owner's pages", () => {
  tester.run('owner-only', jonz.rules['owner-only'], {
    valid: [
      { code: "import { ListTable } from '@/components/admin/list-table';", filename: '/repo/apps/client/src/app/admin/audit/index.tsx' },
      { code: "import { auditPage } from '@/api/owner';", filename: '/repo/apps/client/src/components/admin/busy-list.tsx' },
      { code: "import { ListTable } from '@/components/admin/list-table';", filename: '/repo/apps/client/src/components/style-page/samples.tsx' },
      { code: "import { Reply } from '@/components/reply/reply';", filename: '/repo/apps/client/src/app/(tabs)/house.tsx' },
      { code: "import { ownerish } from '@/components/administer';", filename: '/repo/apps/client/src/app/(tabs)/house.tsx' },
    ],
    invalid: [
      { code: "import { AdminShell } from '@/components/admin/admin-shell';", filename: '/repo/apps/client/src/app/(tabs)/house.tsx', errors: [{ messageId: 'owner' }] },
      { code: "import { auditPage } from '@/api/owner';", filename: '/repo/apps/client/src/components/chat/chat.tsx', errors: [{ messageId: 'owner' }] },
      { code: "import { X } from '../admin/list-table';", filename: '/repo/apps/client/src/components/house/x.tsx', errors: [{ messageId: 'owner' }] },
      { code: "export * from '@/components/admin/list-table';", filename: '/repo/apps/client/src/components/index.ts', errors: [{ messageId: 'owner' }] },
      { code: "const m = import('@/api/owner');", filename: '/repo/apps/client/src/app/index.tsx', errors: [{ messageId: 'owner' }] },
    ],
  });
});
