// Jonz's house style, checked by the linter. The rules are written down in
// docs/style/; these catch the ones a machine can see. Code that broke a rule
// before the rule existed is listed in eslint-suppressions.json, so it warns
// nobody until someone fixes it (then `npx eslint --prune-suppressions`
// shrinks the list); anything new fails.

const path = require('node:path');

const COLOUR_KEY = /(^color$|Color$|^fill$|^stroke$)/;
const COLOUR_VALUE = /^(#[0-9a-f]{3,8}|(rgb|rgba|hsl|hsla)\(.*\)|white|black|red|green|blue|yellow|orange|grey|gray)$/i;
const SPACING_KEY = /^(padding|margin)(Top|Bottom|Left|Right|Horizontal|Vertical|Start|End|Block|Inline)?$|^(gap|rowGap|columnGap)$/;
const TYPE_KEY = /^(fontSize|lineHeight|letterSpacing)$/;
const RADIUS_KEY = /^border(TopLeft|TopRight|BottomLeft|BottomRight|TopStart|TopEnd|BottomStart|BottomEnd)?Radius$/;
const BUTTONS = new Set(['Button', 'TextButton', 'IconButton']);
// Plain layout boxes: a Button straight inside one of these has nothing placing it.
const LAYOUT = new Set(['View', 'ScrollView', 'KeyboardAvoidingView', 'SafeAreaView']);
// The kit's files that may draw a spinner (docs/style/states.md, "Waiting").
const SPINNER_KIT = ['button.tsx', 'tick-box.tsx', 'list-foot.tsx', 'admin/smart-search.tsx', 'read-state.tsx', 'outline.tsx', 'waiting.tsx', 'style-page/'];
// What a wait is called in a Button's `disabled`: a mutation's isPending, or busy, sending, saving and the like.
const WAIT_NAMES = /\b(isPending|pending|busy|sending|saving|loading|working|isLoading|isFetching)\b/i;
const PRESSABLES = new Set(['Pressable', 'TouchableOpacity', 'TouchableHighlight', 'TouchableWithoutFeedback']);

function keyName(property) {
  if (property.computed) return null;
  if (property.key.type === 'Identifier') return property.key.name;
  if (property.key.type === 'Literal') return String(property.key.value);
  return null;
}

/** A plain number written in place, or a negative one. */
function rawNumber(node) {
  if (node.type === 'Literal' && typeof node.value === 'number') return node.value;
  if (node.type === 'UnaryExpression' && node.operator === '-' && node.argument.type === 'Literal' && typeof node.argument.value === 'number') {
    return -node.argument.value;
  }
  return null;
}

function elementName(node) {
  const name = node.openingElement.name;
  return name.type === 'JSXIdentifier' ? name.name : null;
}

/** The elements among a JSX element's children, looking through `{cond ? <A/> : <B/>}` and `{x && <A/>}`. */
function childElements(node) {
  const out = [];
  for (const child of node.children) {
    if (child.type === 'JSXElement') out.push(child);
    else if (child.type === 'JSXExpressionContainer') {
      const e = child.expression;
      if (e.type === 'JSXElement') out.push(e);
      else if (e.type === 'ConditionalExpression' && e.consequent.type === 'JSXElement') out.push(e.consequent);
      else if (e.type === 'LogicalExpression' && e.right.type === 'JSXElement') out.push(e.right);
    }
  }
  return out;
}

/** Whether an element is a button, or a View wrapping just one button (the old "half"). */
function isButtonish(element) {
  const name = elementName(element);
  if (BUTTONS.has(name)) return name === 'Button';
  if (name !== 'View') return false;
  const inner = childElements(element);
  return inner.length === 1 && isButtonish(inner[0]);
}

module.exports = {
  meta: { name: 'jonz' },
  rules: {
    'no-raw-colour': {
      meta: {
        type: 'problem',
        docs: { description: 'Colours come from useTheme(), never written by hand (docs/style/feel.md).' },
        messages: { raw: 'Write no colour by hand: take it from useTheme().colors (docs/style/feel.md).' },
        schema: [],
      },
      create(context) {
        return {
          Property(node) {
            const key = keyName(node);
            if (!key || !COLOUR_KEY.test(key)) return;
            if (node.value.type === 'Literal' && typeof node.value.value === 'string' && COLOUR_VALUE.test(node.value.value)) {
              context.report({ node: node.value, messageId: 'raw' });
            }
          },
          JSXAttribute(node) {
            if (node.name.type !== 'JSXIdentifier' || !COLOUR_KEY.test(node.name.name)) return;
            const v = node.value;
            if (v && v.type === 'Literal' && typeof v.value === 'string' && COLOUR_VALUE.test(v.value)) {
              context.report({ node: v, messageId: 'raw' });
            }
          },
        };
      },
    },
    'no-raw-type-size': {
      meta: {
        type: 'problem',
        docs: { description: 'Text sizes come from the six text roles (docs/style/words.md).' },
        messages: { raw: 'Use a text role from useTheme().type instead of a {{key}} written by hand (docs/style/words.md).' },
        schema: [],
      },
      create(context) {
        return {
          Property(node) {
            const key = keyName(node);
            if (!key || !TYPE_KEY.test(key)) return;
            const n = rawNumber(node.value);
            if (n !== null && n !== 0) context.report({ node: node.value, messageId: 'raw', data: { key } });
          },
        };
      },
    },
    'spacing-from-scale': {
      meta: {
        type: 'problem',
        docs: { description: 'Spacing and corners come from the theme (docs/style/lists.md).' },
        messages: {
          space: 'Take {{key}} from the theme (SPACE, GUTTER, INSET, LABEL_GAP, SECTION_GAP), not a number written by hand (docs/style/lists.md).',
          radius: 'Take {{key}} from the theme (RADIUS, GROUP_RADIUS), not a number written by hand.',
        },
        schema: [],
      },
      create(context) {
        return {
          Property(node) {
            const key = keyName(node);
            if (!key) return;
            const n = rawNumber(node.value);
            if (n === null || n === 0) return;
            if (SPACING_KEY.test(key)) context.report({ node: node.value, messageId: 'space', data: { key } });
            else if (RADIUS_KEY.test(key) && n < 999) context.report({ node: node.value, messageId: 'radius', data: { key } });
          },
        };
      },
    },
    'no-hand-made-button-row': {
      meta: {
        type: 'problem',
        docs: { description: 'Buttons side by side go in a ButtonRow (docs/style/controls.md).' },
        messages: { row: 'Put buttons that sit together in a ButtonRow: equal widths, stacking when narrow (docs/style/controls.md).' },
        schema: [],
      },
      create(context) {
        return {
          JSXElement(node) {
            const name = elementName(node);
            if (name === 'ButtonRow' || name === 'Fragment') return;
            const buttons = childElements(node).filter(isButtonish);
            if (buttons.length < 2) return;
            // A column of buttons is fine; a row of them is the thing to catch.
            if (!looksLikeRow(node, context)) return;
            context.report({ node: node.openingElement, messageId: 'row' });
          },
        };
      },
    },
    'button-in-row': {
      meta: {
        type: 'problem',
        docs: { description: 'Every Button is placed by a ButtonRow, alone or with others (docs/style/controls.md).' },
        messages: {
          loose:
            'Put this Button in a ButtonRow, even on its own: it fills the column on a phone and keeps its own width in a wide one on a laptop (docs/style/controls.md).',
        },
        schema: [],
      },
      create(context) {
        return {
          JSXElement(node) {
            if (elementName(node) !== 'Button') return;
            // An icon alone is a square wherever it sits (IconButton).
            if (node.openingElement.attributes.some((a) => a.type === 'JSXAttribute' && a.name.name === 'iconOnly')) return;
            // The nearest element holding it, looking through fragments, `cond ? a : b` and `x && a`.
            let at = node.parent;
            while (at && at.type !== 'JSXElement') {
              if (!['JSXFragment', 'JSXExpressionContainer', 'ConditionalExpression', 'LogicalExpression'].includes(at.type)) return;
              at = at.parent;
            }
            if (at && LAYOUT.has(elementName(at))) context.report({ node: node.openingElement, messageId: 'loose' });
          },
        };
      },
    },
    'no-pressable-in-screens': {
      meta: {
        type: 'problem',
        docs: { description: 'Screens use the shared controls, never their own pressables (docs/style/controls.md).' },
        messages: { screen: 'Screens use Button, IconButton, TextButton, Row or another shared control, not {{name}} (docs/style/controls.md).' },
        schema: [],
      },
      create(context) {
        const file = context.filename.replace(/\\/g, '/');
        if (!/\/src\/app\//.test(file)) return {};
        return {
          ImportSpecifier(node) {
            const parent = node.parent;
            if (parent.source.value !== 'react-native') return;
            const name = node.imported.name;
            if (PRESSABLES.has(name)) context.report({ node, messageId: 'screen', data: { name } });
          },
        };
      },
    },
    'no-bare-spinner': {
      meta: {
        type: 'problem',
        docs: { description: "A wait shows the part's own outline, or a busy button, never a spinner alone (docs/style/states.md)." },
        messages: {
          spinner:
            "Show what's coming while it reads: wrap it in Waiting with its outline (components/waiting.tsx, outline.tsx), or give the Button `busy`; not a spinner on its own (docs/style/states.md, \"Waiting\").",
        },
        schema: [],
      },
      create(context) {
        const file = context.filename.replace(/\\/g, '/');
        // The kit's own pieces draw the spinners that are allowed: a busy button or tick, a list's foot, a list's search box, the style page.
        if (SPINNER_KIT.some((kit) => file.includes(`/src/components/${kit}`))) return {};
        return {
          ImportSpecifier(node) {
            const source = node.parent.source.value;
            const name = node.imported.name;
            const spinner = source === 'react-native' && name === 'ActivityIndicator';
            const reading = name === 'Reading' && /(^|\/)read-state$/.test(source);
            if (spinner || reading) context.report({ node, messageId: 'spinner' });
          },
        };
      },
    },
    'busy-not-disabled': {
      meta: {
        type: 'problem',
        docs: { description: 'A button waiting on the server is busy, not switched off (docs/style/states.md).' },
        messages: {
          busy: 'A Button waiting on the server takes `busy` and a `busyLabel` ("Leaving"), not `disabled`: pale reads as switched off (docs/style/states.md, "Waiting").',
        },
        schema: [],
      },
      create(context) {
        return {
          JSXAttribute(node) {
            if (node.name.type !== 'JSXIdentifier' || node.name.name !== 'disabled') return;
            const element = node.parent;
            if (element.name.type !== 'JSXIdentifier' || element.name.name !== 'Button') return;
            if (!node.value || node.value.type !== 'JSXExpressionContainer') return;
            // A wait, by the names a wait goes by: a mutation's isPending, busy, sending, saving.
            const source = context.sourceCode.getText(node.value.expression);
            if (WAIT_NAMES.test(source)) context.report({ node, messageId: 'busy' });
          },
        };
      },
    },
    'owner-only': {
      meta: {
        type: 'problem',
        docs: { description: "The owner's pieces stay on the owner's pages: only /admin imports them (docs/specs/owner-admin.md)." },
        messages: {
          owner: "{{source}} is the owner's: only the /admin screens and components/admin use it, so it can't reach a housemate's app.",
        },
        schema: [],
      },
      create(context) {
        const file = context.filename.replace(/\\/g, '/');
        // The owner's own pages, their pieces, and the hidden style page, which shows every piece.
        if (/\/src\/(app\/admin|components\/admin|components\/style-page)\//.test(file)) return {};
        // Where an import points, from the alias or relative to this file.
        const where = (source) =>
          source.startsWith('@/') ? `/src/${source.slice(2)}` : source.startsWith('.') ? path.posix.join(path.posix.dirname(file), source) : source;
        const owners = (source) => /\/src\/(components\/admin|api\/owner)(\/|$)/.test(where(source));
        const check = (node) => {
          const source = node.source && node.source.value;
          if (typeof source === 'string' && owners(source)) context.report({ node, messageId: 'owner', data: { source } });
        };
        return { ImportDeclaration: check, ExportNamedDeclaration: check, ExportAllDeclaration: check, ImportExpression: check };
      },
    },
  },
};

/**
 * Whether an element lays its children out in a row: its style names one
 * with flexDirection 'row', written in place or in the file's StyleSheet.
 */
function looksLikeRow(node, context) {
  const attr = node.openingElement.attributes.find((a) => a.type === 'JSXAttribute' && a.name.name === 'style');
  if (!attr || !attr.value || attr.value.type !== 'JSXExpressionContainer') return false;
  const source = context.sourceCode.getText(attr.value.expression);
  if (/flexDirection:\s*'row'/.test(source)) return true;
  const names = [...source.matchAll(/styles\.(\w+)/g)].map((m) => m[1]);
  const text = context.sourceCode.getText();
  return names.some((n) => new RegExp(`\\b${n}:\\s*\\{[^}]*flexDirection:\\s*'row'`).test(text));
}
