import {
  ADMIN_COPY,
  formatLocalDateTime,
  NOTICE_COPY,
  NOTICE_ENDS,
  NOTICE_ENDS_LABEL,
  NOTICE_KINDS,
  NOTICE_PRESETS,
  noticeEndsAt,
  noticeProblems,
  parseLocalDateTime,
  type Notice,
  type NoticeDraft,
  type NoticeEnds,
  type NoticeKind,
  BUSY_COPY,
} from '@app/core';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { SavedNotice } from '@/api/owner';
import { Button } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { Field, FieldLabel } from '@/components/field';
import { Segmented } from '@/components/segmented';
import { Meta } from '@/components/text';
import { SPACE } from '@/theme';

type Starts = 'now' | 'later';

interface Form {
  kind: NoticeKind;
  title: string;
  body: string;
  linkLabel: string;
  linkUrl: string;
  starts: Starts;
  startsAt: string;
  ends: NoticeEnds;
  endsAt: string;
}

function formFor(notice: Notice | null, kind: NoticeKind, now: Date): Form {
  if (!notice) {
    return { kind, title: '', body: '', linkLabel: '', linkUrl: '', starts: 'now', startsAt: '', ends: 'never', endsAt: '' };
  }
  const later = Date.parse(notice.startsAt) > now.getTime();
  return {
    kind: notice.kind,
    title: notice.title,
    body: notice.body,
    linkLabel: notice.linkLabel ?? '',
    linkUrl: notice.linkUrl ?? '',
    starts: later ? 'later' : 'now',
    startsAt: later ? formatLocalDateTime(new Date(notice.startsAt)) : '',
    ends: notice.endsAt ? 'date' : 'never',
    endsAt: notice.endsAt ? formatLocalDateTime(new Date(notice.endsAt)) : '',
  };
}

/**
 * Writing or changing a notice: a preset for the usual outages, its kind,
 * words, an optional button, and when it shows. Checked here in sentences
 * before the database checks it again. A notice already showing keeps its
 * start; `onEnd` ends it now.
 */
export function NoticeEditor({
  notice,
  kind = 'status',
  waiting,
  onSave,
  onEnd,
}: {
  notice: Notice | null;
  /** A new notice's kind to start with: the tile it was started from. */
  kind?: NoticeKind;
  /** Which of its buttons is waiting on the server. */
  waiting: 'save' | 'end' | null;
  onSave: (saved: SavedNotice) => void;
  onEnd?: () => void;
}) {
  const [now] = useState(() => new Date());
  const [form, setForm] = useState<Form>(() => formFor(notice, kind, now));
  const [tried, setTried] = useState(false);
  const set = (patch: Partial<Form>) => setForm((current) => ({ ...current, ...patch }));

  const showing = notice !== null && Date.parse(notice.startsAt) <= now.getTime();
  const startsAt =
    showing ? new Date(notice.startsAt) : form.starts === 'later' ? parseLocalDateTime(form.startsAt) : null;
  const start = startsAt ?? now;
  const endsAt = noticeEndsAt(form.ends, start, form.ends === 'date' ? parseLocalDateTime(form.endsAt) : null);
  const draft: NoticeDraft = { ...form, startsAt, endsAt };
  const problems = noticeProblems(draft, now);
  if (!showing && form.starts === 'later' && startsAt === null) problems.startsAt = ADMIN_COPY.startsAtLabel;
  if (form.ends === 'date' && endsAt === null) problems.endsAt = ADMIN_COPY.endsAtLabel;
  const ok = Object.keys(problems).length === 0;
  const shown = (key: keyof typeof problems) => (tried ? problems[key] : undefined);

  const save = () => {
    setTried(true);
    if (!ok) return;
    onSave({
      id: notice?.id ?? null,
      kind: form.kind,
      title: form.title.trim(),
      body: form.body.trim(),
      linkLabel: form.linkLabel.trim() || null,
      linkUrl: form.linkUrl.trim() || null,
      startsAt,
      endsAt,
    });
  };

  const presets = NOTICE_PRESETS.filter((preset) => preset.kind === form.kind);

  return (
    <View style={styles.form} testID="notice-editor">
      {notice === null && presets.length > 0 ? (
        <View style={styles.group}>
          <FieldLabel>{ADMIN_COPY.startFrom}</FieldLabel>
          <View style={styles.presets}>
            {presets.map((preset) => (
              <Button
                key={preset.label}
                label={preset.label}
                variant="outline"
                chosen={form.title === preset.title}
                onPress={() => set({ kind: preset.kind, title: preset.title, body: preset.body })}
              />
            ))}
          </View>
        </View>
      ) : null}
      <View style={styles.group}>
        <FieldLabel>{ADMIN_COPY.kind}</FieldLabel>
        <Segmented
          label={ADMIN_COPY.kind}
          options={NOTICE_KINDS.map((kind) => ({ value: kind, label: NOTICE_COPY.kinds[kind] }))}
          value={form.kind}
          onChange={(kind) => set({ kind })}
          equal
        />
        <Meta>{NOTICE_COPY.kindHints[form.kind]}</Meta>
      </View>
      <Field label={ADMIN_COPY.title} value={form.title} onChangeText={(title) => set({ title })} problem={shown('title')} maxLength={80} testID="notice-title" />
      <Field label={ADMIN_COPY.more} value={form.body} onChangeText={(body) => set({ body })} problem={shown('body')} multiline maxLength={240} testID="notice-body" />
      <Field label={ADMIN_COPY.buttonLabel} value={form.linkLabel} onChangeText={(linkLabel) => set({ linkLabel })} problem={shown('linkLabel')} maxLength={30} />
      <Field
        label={ADMIN_COPY.buttonLink}
        value={form.linkUrl}
        onChangeText={(linkUrl) => set({ linkUrl })}
        problem={shown('linkUrl')}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />
      {showing ? null : (
        <View style={styles.group}>
          <FieldLabel>{ADMIN_COPY.starts}</FieldLabel>
          <Segmented
            label={ADMIN_COPY.starts}
            options={[
              { value: 'now', label: ADMIN_COPY.startsNow },
              { value: 'later', label: ADMIN_COPY.startsLater },
            ]}
            value={form.starts}
            onChange={(starts: Starts) => set({ starts, startsAt: form.startsAt || formatLocalDateTime(new Date(now.getTime() + 86_400_000)) })}
            equal
          />
          {form.starts === 'later' ? (
            <Field label={ADMIN_COPY.startsAtLabel} value={form.startsAt} onChangeText={(text) => set({ startsAt: text })} problem={shown('startsAt')} />
          ) : null}
        </View>
      )}
      <View style={styles.group}>
        <FieldLabel>{ADMIN_COPY.ends}</FieldLabel>
        <Segmented
          label={ADMIN_COPY.ends}
          options={NOTICE_ENDS.map((ends) => ({ value: ends, label: NOTICE_ENDS_LABEL[ends] }))}
          value={form.ends}
          onChange={(ends) => set({ ends, endsAt: form.endsAt || formatLocalDateTime(new Date(start.getTime() + 7 * 86_400_000)) })}
          // Four choices don't fit one row of the panel, or of a phone: two rows of two.
          perRow={2}
        />
        {form.ends === 'date' ? (
          <Field label={ADMIN_COPY.endsAtLabel} value={form.endsAt} onChangeText={(text) => set({ endsAt: text })} problem={shown('endsAt')} />
        ) : (
          shown('endsAt') ? <Meta>{problems.endsAt}</Meta> : null
        )}
      </View>
      <View style={styles.actions}>
        <ButtonRow stacked>
          <Button label={notice === null && form.starts === 'now' ? ADMIN_COPY.saveAndShow : ADMIN_COPY.save} onPress={save} busy={waiting === 'save'} busyLabel={BUSY_COPY.saving} testID="notice-save" />
          {onEnd ? <Button label={ADMIN_COPY.endNow} variant="hazard" onPress={onEnd} busy={waiting === 'end'} busyLabel={BUSY_COPY.ending} testID="notice-end" /> : null}
        </ButtonRow>
      </View>
      <Meta>{ADMIN_COPY.auditNote}</Meta>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: SPACE.xl },
  group: { gap: SPACE.sm },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  actions: { gap: SPACE.sm },
});
