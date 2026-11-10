import { MESSAGE_AUDIENCES, MESSAGE_COPY, MESSAGE_LIMITS, messageProblems, messageWays, sendLabel, testWays, wayMeta, type MessageAudience, type MessageWays } from '@app/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { EyeIcon, SendIcon } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { messageReach, sendMessage, type OutgoingMessage } from '@/api/messages';
import { MessagePreview, RecipientPicker, type Picked } from '@/components/admin/message-parts';
import { Alert } from '@/components/alert';
import { Button } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { ConfirmSheet } from '@/components/confirm-sheet';
import { Field, FieldLabel } from '@/components/field';
import { Group } from '@/components/group';
import { Section } from '@/components/section';
import { Segmented } from '@/components/segmented';
import { ChoiceRow } from '@/components/setup/choice-row';
import { Sheet } from '@/components/sheet';
import { Meta } from '@/components/text';
import { useToast } from '@/components/toast';
import { SPACE } from '@/theme';
import { useWords } from '@/hooks/use-words';

/** The key every list of sent messages reads under: a send makes them read again. */
export const SENT_KEY = ['owner-sent'] as const;

interface Form {
  audience: MessageAudience;
  picked: Picked | null;
  subject: string;
  body: string;
  ways: MessageWays;
}

const START: Form = { audience: 'house', picked: null, subject: '', body: '', ways: { push: true, wall: true, email: false } };

/**
 * A new message, to write and send: who it's to, what it says, how it goes
 * out, then Send and "Send me a test". Everyone needs a second tap that
 * names the number. `beside` (the side panel of a laptop's Messages) shows
 * how it looks under the form; otherwise that opens as a sheet from its own
 * button. `onSent` runs once a real message (not a test) has gone.
 */
export function MessageForm({ beside = false, onSent }: { beside?: boolean; onSent?: () => void }) {
  const words = useWords();
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
      onSent?.();
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
  // On a phone the two aren't in one row, so each holds still while the other sends.
  const testing = send.isPending && send.variables?.audience === 'test';
  const sendingIt = send.isPending && !testing;
  const sendButton = (
    <Button
      label={sendLabel(form.audience, reach.data ?? null, form.picked?.name ?? null)}
      icon={SendIcon}
      onPress={onSend}
      busy={sendingIt}
      busyLabel={words('common.busy.sending')}
      disabled={testing}
      testID="message-send"
    />
  );
  const testButton = (
    <Button
      label={MESSAGE_COPY.sendTest}
      variant="outline"
      onPress={onTest}
      busy={testing}
      busyLabel={words('common.busy.sendingTest')}
      disabled={sendingIt}
      testID="message-test"
    />
  );

  return (
    <>
      <View style={styles.form} testID="message-form">
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
          {beside ? (
            <ButtonRow>
              {sendButton}
              {testButton}
            </ButtonRow>
          ) : (
            <>
              <ButtonRow>{sendButton}</ButtonRow>
              <ButtonRow>
                <Button label={MESSAGE_COPY.preview} variant="outline" icon={EyeIcon} onPress={() => setPreviewing(true)} testID="message-preview-open" />
                {testButton}
              </ButtonRow>
            </>
          )}
          <Meta>{MESSAGE_COPY.auditNote}</Meta>
        </View>
        {beside ? (
          <Section label={MESSAGE_COPY.howItLooks} bare>
            {preview}
          </Section>
        ) : null}
      </View>
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
        busyLabel={words('common.busy.sending')}
        problem={send.error?.message ?? null}
        onConfirm={() => send.mutate(outgoing('everyone'))}
        onClose={() => setConfirming(false)}
        testID="message-confirm"
      />
    </>
  );
}

const styles = StyleSheet.create({
  form: { gap: SPACE.xl },
  group: { gap: SPACE.sm },
});
