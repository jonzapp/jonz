import {
  MESSAGE_AUDIENCES,
  MESSAGE_COPY,
  MESSAGE_LIMITS,
  messageProblems,
  messageWays,
  reportAge,
  sendLabel,
  sentMeta,
  testWays,
  wayMeta,
  type MessageAudience,
  type MessageWays,
} from '@app/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EyeIcon, SendIcon } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { messageReach, sendMessage, sentPage, type OutgoingMessage } from '@/api/messages';
import { MessagePreview, RecipientPicker, type Picked } from '@/components/admin/message-parts';
import { Alert } from '@/components/alert';
import { Button } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { ConfirmSheet } from '@/components/confirm-sheet';
import { Field, FieldLabel } from '@/components/field';
import { Group } from '@/components/group';
import { Row } from '@/components/row';
import { Columns, Screen, useColumns } from '@/components/screen';
import { Section } from '@/components/section';
import { Segmented } from '@/components/segmented';
import { ChoiceRow } from '@/components/setup/choice-row';
import { Sheet } from '@/components/sheet';
import { Meta } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { TitleBar } from '@/components/title-bar';
import { useToast } from '@/components/toast';
import { FORM_MAX, SPACE } from '@/theme';
import { useOwnerMay } from '@/components/admin/use-owner-may';
import { AdminSwitch } from '@/components/admin/admin-shell';

const SENT_KEY = ['owner-sent'] as const;
const RECENT = 5;

interface Form {
  audience: MessageAudience;
  picked: Picked | null;
  subject: string;
  body: string;
  ways: MessageWays;
}

const START: Form = { audience: 'house', picked: null, subject: '', body: '', ways: { push: true, wall: true, email: false } };

/**
 * Messages: write one message to a person, a house or everyone, as a push,
 * a post on their Wall and an email, see how it looks, send yourself a test,
 * then send it. Everyone needs a second tap that names the number. On a
 * laptop how it looks and what was sent last sit beside the form; on a
 * phone they're under it, and the preview opens as a sheet.
 */
export default function MessagesPage() {
  // Someone whose app role can't send (support) sees only what was sent.
  const may = useOwnerMay('messages:write');
  return (
    <Screen spreads bar={<TitleBar title={MESSAGE_COPY.page} />} testID="admin-messages">
      <AdminSwitch page="messages" />
      {may ? <Messages /> : <RecentlySent />}
    </Screen>
  );
}

function Messages() {
  const two = useColumns();
  const toast = useToast();
  const client = useQueryClient();
  const [form, setForm] = useState<Form>(START);
  const [tried, setTried] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const set = (patch: Partial<Form>) => setForm((current) => ({ ...current, ...patch }));

  const personId = form.audience === 'person' ? (form.picked?.id ?? null) : null;
  const houseId = form.audience === 'house' ? (form.picked?.id ?? null) : null;
  const ways = messageWays(form.audience, form.ways);
  const reach = useQuery({
    queryKey: ['owner-reach', form.audience, personId, houseId],
    queryFn: () => messageReach(form.audience, personId, houseId),
    enabled: form.audience === 'everyone' || form.picked !== null,
  });
  const problems = messageProblems({ audience: form.audience, personId, houseId, subject: form.subject, body: form.body, ways: form.ways });
  const ok = Object.keys(problems).length === 0;
  const shown = (key: keyof typeof problems) => (tried ? problems[key] : undefined);

  const send = useMutation({
    mutationFn: (message: OutgoingMessage) => sendMessage(message),
    onSuccess: (sent, message) => {
      void client.invalidateQueries({ queryKey: SENT_KEY });
      setConfirming(false);
      if (message.audience === 'test') {
        toast.show(MESSAGE_COPY.testToast);
        return;
      }
      toast.show(MESSAGE_COPY.sentToast(sent.people));
      setForm((current) => ({ ...current, subject: '', body: '' }));
      setTried(false);
    },
  });
  const outgoing = (audience: OutgoingMessage['audience']): OutgoingMessage => ({
    audience,
    personId,
    houseId,
    subject: form.subject,
    body: form.body,
    ways: audience === 'test' ? testWays(form.ways) : ways,
  });

  const onSend = () => {
    setTried(true);
    if (!ok) return;
    if (form.audience === 'everyone') setConfirming(true);
    else send.mutate(outgoing(form.audience));
  };
  const onTest = () => {
    // A test needs only the words: who it's for doesn't matter yet.
    const words = messageProblems({ audience: 'everyone', personId: null, houseId: null, subject: form.subject, body: form.body, ways: form.ways });
    setTried(true);
    if (words.subject || words.body) return;
    send.mutate(outgoing('test'));
  };

  const preview = <MessagePreview subject={form.subject} body={form.body} push={ways.push || !ways.wall} wall={ways.wall} />;
  const sendButton = (
    <Button label={sendLabel(form.audience, reach.data ?? null, form.picked?.name ?? null)} icon={SendIcon} onPress={onSend} disabled={send.isPending} testID="message-send" />
  );
  const testButton = <Button label={MESSAGE_COPY.sendTest} variant="outline" onPress={onTest} disabled={send.isPending} testID="message-test" />;

  const formView = (
    <View style={[styles.form, two && styles.capped]} testID="message-form">
      <View style={styles.group}>
        <FieldLabel>{MESSAGE_COPY.to}</FieldLabel>
        <Segmented
          label={MESSAGE_COPY.to}
          options={MESSAGE_AUDIENCES.map((audience) => ({ value: audience, label: MESSAGE_COPY.audience[audience] }))}
          value={form.audience}
          onChange={(audience) => set({ audience, picked: null })}
          equal
          testID="message-audience"
        />
      </View>
      {form.audience === 'everyone' ? null : (
        <RecipientPicker key={form.audience} audience={form.audience} picked={form.picked} onPick={(picked) => set({ picked })} problem={shown('who')} />
      )}
      <Field
        label={MESSAGE_COPY.subject}
        value={form.subject}
        onChangeText={(subject) => set({ subject })}
        problem={shown('subject')}
        maxLength={MESSAGE_LIMITS.subject}
        testID="message-subject"
      />
      <Field
        label={MESSAGE_COPY.body}
        value={form.body}
        onChangeText={(body) => set({ body })}
        problem={shown('body')}
        hint={MESSAGE_COPY.count(form.body.trim().length, MESSAGE_LIMITS.body)}
        multiline
        maxLength={MESSAGE_LIMITS.body}
        testID="message-body"
      />
      <View style={styles.group}>
        <FieldLabel>{MESSAGE_COPY.sendAs}</FieldLabel>
        <Group>
          <ChoiceRow
            role="checkbox"
            label={MESSAGE_COPY.wall}
            meta={wayMeta('wall', form.audience, reach.data ?? null)}
            metaLines={2}
            checked={ways.wall}
            disabled={form.audience === 'person'}
            onPress={() => set({ ways: { ...form.ways, wall: !form.ways.wall } })}
            testID="message-way-wall"
          />
          <ChoiceRow
            role="checkbox"
            label={MESSAGE_COPY.push}
            meta={wayMeta('push', form.audience, reach.data ?? null)}
            metaLines={2}
            checked={ways.push}
            onPress={() => set({ ways: { ...form.ways, push: !form.ways.push } })}
            testID="message-way-push"
          />
          <ChoiceRow
            role="checkbox"
            label={MESSAGE_COPY.email}
            meta={wayMeta('email', form.audience, reach.data ?? null)}
            checked={ways.email}
            onPress={() => set({ ways: { ...form.ways, email: !form.ways.email } })}
            testID="message-way-email"
          />
        </Group>
        {shown('ways') ? <Alert message={problems.ways!} /> : null}
      </View>
      {send.error && !confirming ? <Alert message={send.error.message} testID="message-problem" /> : null}
      <View style={styles.group}>
        {two ? (
          <ButtonRow>
            {sendButton}
            {testButton}
          </ButtonRow>
        ) : (
          <>
            {sendButton}
            <ButtonRow>
              <Button label={MESSAGE_COPY.preview} variant="outline" icon={EyeIcon} onPress={() => setPreviewing(true)} testID="message-preview-open" />
              {testButton}
            </ButtonRow>
          </>
        )}
        <Meta>{MESSAGE_COPY.auditNote}</Meta>
      </View>
    </View>
  );

  const side = (
    <View style={styles.side}>
      {two ? (
        <Section label={MESSAGE_COPY.howItLooks} bare>
          {preview}
        </Section>
      ) : null}
      <RecentlySent />
    </View>
  );

  return (
    <>
      {two ? (
        <Columns main={formView} side={side} />
      ) : (
        <View style={styles.phone}>
          {formView}
          {side}
        </View>
      )}
      <Sheet visible={previewing} title={MESSAGE_COPY.howItLooks} onClose={() => setPreviewing(false)} testID="message-preview-sheet">
        {preview}
      </Sheet>
      <ConfirmSheet
        visible={confirming}
        title={MESSAGE_COPY.confirmEveryone(reach.data?.people ?? 0)}
        body={MESSAGE_COPY.confirmEveryoneBody}
        confirmLabel={MESSAGE_COPY.confirmSend(reach.data?.people ?? 0)}
        tone="primary"
        busy={send.isPending}
        problem={send.error?.message ?? null}
        onConfirm={() => send.mutate(outgoing('everyone'))}
        onClose={() => setConfirming(false)}
        testID="message-confirm"
      />
    </>
  );
}

/** The last few messages sent, newest first, and the way to all of them. */
function RecentlySent() {
  const recent = useQuery({
    queryKey: [...SENT_KEY, 'recent'],
    queryFn: () => sentPage(null, { q: '', audience: null, way: null, after: null, before: null }, RECENT),
  });
  const now = new Date();
  return (
    <Section
      label={MESSAGE_COPY.sent}
      right={<TextButton label={MESSAGE_COPY.allSent} href={'/admin/messages/sent' as never} chevron testID="message-all-sent" />}
      testID="message-recent"
    >
      {recent.data && recent.data.items.length > 0 ? (
        recent.data.items.map((m) => (
          <Row
            key={m.id}
            title={m.subject}
            meta={`${sentMeta(m)}, ${reportAge(m.sentAt, now)}`}
            metaLines={2}
            testID={`sent-${m.id}`}
          />
        ))
      ) : (
        <Row title={MESSAGE_COPY.nothingSent} meta={MESSAGE_COPY.nothingSentBody} metaLines={2} />
      )}
    </Section>
  );
}

const styles = StyleSheet.create({
  form: { gap: SPACE.xl },
  capped: { maxWidth: FORM_MAX, width: '100%' },
  group: { gap: SPACE.sm },
  side: { gap: SPACE.xl },
  phone: { gap: SPACE.xxl },
});
