import { atLocalTime, localDayTime, NOTICE_ENDS, NOTICE_ENDS_LABEL, NOTICE_KINDS, NOTICE_PRESETS, noticeEndsAt, noticeLaterStart, noticeProblems, noticeTimes, type Notice, type NoticeDraft, type NoticeEnds, type NoticeKind } from '@app/core';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { SavedNotice } from '@/api/owner';
import { Alert } from '@/components/alert';
import { Button } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { DateField } from '@/components/date-field';
import { Field, FieldLabel } from '@/components/field';
import { Segmented } from '@/components/segmented';
import { Select } from '@/components/select';
import { Meta } from '@/components/text';
import { SPACE } from '@/theme';
import { useWords } from '@/hooks/use-words';

type Starts = 'now' | 'later';

interface Form {
  kind: NoticeKind;
  title: string;
  body: string;
  linkLabel: string;
  linkUrl: string;
  starts: Starts;
  /** A later start's day ("2026-11-30") and time ("09:00") on this device's clock; empty until Later is picked. */
  startsOn: string;
  startsTime: string;
  ends: NoticeEnds;
  /** The end's day and time when it ends on a date; empty until then. */
  endsOn: string;
  endsTime: string;
}

function formFor(notice: Notice | null, kind: NoticeKind, now: Date): Form {
  if (!notice) {
    return { kind, title: '', body: '', linkLabel: '', linkUrl: '', starts: 'now', startsOn: '', startsTime: '', ends: 'never', endsOn: '', endsTime: '' };
  }
  const later = Date.parse(notice.startsAt) > now.getTime();
  const start = later ? localDayTime(new Date(notice.startsAt)) : { day: '', time: '' };
  const end = notice.endsAt ? localDayTime(new Date(notice.endsAt)) : { day: '', time: '' };
  return {
    kind: notice.kind,
    title: notice.title,
    body: notice.body,
    linkLabel: notice.linkLabel ?? '',
    linkUrl: notice.linkUrl ?? '',
    starts: later ? 'later' : 'now',
    startsOn: start.day,
    startsTime: start.time,
    ends: notice.endsAt ? 'date' : 'never',
    endsOn: end.day,
    endsTime: end.time,
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
  const words = useWords();
  const [now] = useState(() => new Date());
  const [form, setForm] = useState<Form>(() => formFor(notice, kind, now));
  const [tried, setTried] = useState(false);
  const set = (patch: Partial<Form>) => setForm((current) => ({ ...current, ...patch }));

  const showing = notice !== null && Date.parse(notice.startsAt) <= now.getTime();
  const startsAt =
    showing ? new Date(notice.startsAt) : form.starts === 'later' ? atLocalTime(form.startsOn, form.startsTime) : null;
  const start = startsAt ?? now;
  const endsAt = noticeEndsAt(form.ends, start, form.ends === 'date' ? atLocalTime(form.endsOn, form.endsTime) : null);
  const draft: NoticeDraft = { ...form, startsAt, endsAt };
  const problems = noticeProblems(draft, now);
  if (!showing && form.starts === 'later' && startsAt === null) problems.startsAt = words('admin.shell.pickWhen');
  if (form.ends === 'date' && endsAt === null) problems.endsAt = words('admin.shell.pickWhen');
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
          <FieldLabel>{words('admin.shell.startFrom')}</FieldLabel>
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
        <FieldLabel>{words('admin.shell.kind')}</FieldLabel>
        <Segmented
          label={words('admin.shell.kind')}
          options={NOTICE_KINDS.map((kind) => ({ value: kind, label: words(`common.notice.kinds.${kind}` as const) }))}
          value={form.kind}
          onChange={(kind) => set({ kind })}
          equal
        />
        <Meta>{words(`common.notice.kindHints.${form.kind}` as const)}</Meta>
      </View>
      <Field label={words('admin.shell.title')} value={form.title} onChangeText={(title) => set({ title })} problem={shown('title')} maxLength={80} testID="notice-title" />
      <Field label={words('admin.shell.more')} value={form.body} onChangeText={(body) => set({ body })} problem={shown('body')} multiline maxLength={240} testID="notice-body" />
      <Field label={words('admin.shell.buttonLabel')} value={form.linkLabel} onChangeText={(linkLabel) => set({ linkLabel })} problem={shown('linkLabel')} maxLength={30} />
      <Field
        label={words('admin.shell.buttonLink')}
        value={form.linkUrl}
        onChangeText={(linkUrl) => set({ linkUrl })}
        problem={shown('linkUrl')}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />
      <NoticeWhen form={form} set={set} now={now} start={start} showing={showing} shown={shown} />
      <View style={styles.actions}>
        <ButtonRow stacked>
          <Button label={notice === null && form.starts === 'now' ? words('admin.shell.saveAndShow') : words('admin.shell.save')} onPress={save} busy={waiting === 'save'} busyLabel={words('common.busy.saving')} testID="notice-save" />
          {onEnd ? <Button label={words('admin.shell.endNow')} variant="hazard" onPress={onEnd} busy={waiting === 'end'} busyLabel={words('common.busy.ending')} testID="notice-end" /> : null}
        </ButtonRow>
      </View>
      <Meta>{words('admin.shell.auditNote')}</Meta>
    </View>
  );
}

/**
 * When a notice shows: Now or Later (unless it's showing already), and
 * when it ends; Later and On a date each pick a day and a time under the
 * switch, starting a day on and a week after it starts.
 */
function NoticeWhen({
  form,
  set,
  now,
  start,
  showing,
  shown,
}: {
  form: Form;
  set: (patch: Partial<Form>) => void;
  now: Date;
  /** When it starts, or now when it starts now. */
  start: Date;
  showing: boolean;
  /** What's wrong with a field, once Save has been tried. */
  shown: (key: 'startsAt' | 'endsAt') => string | undefined;
}) {
  const words = useWords();
  const today = localDayTime(now).day;
  const startDay = localDayTime(start).day;
  const endsProblem = shown('endsAt');
  return (
    <>
      {showing ? null : (
        <View style={styles.group}>
          <FieldLabel>{words('admin.shell.starts')}</FieldLabel>
          <Segmented
            label={words('admin.shell.starts')}
            options={[
              { value: 'now', label: words('admin.shell.startsNow') },
              { value: 'later', label: words('admin.shell.startsLater') },
            ]}
            value={form.starts}
            onChange={(starts: Starts) => {
              const later = localDayTime(noticeLaterStart(now));
              set({ starts, startsOn: form.startsOn || later.day, startsTime: form.startsTime || later.time });
            }}
            equal
          />
          {form.starts === 'later' ? (
            <DayAndTime
              dayLabel={words('admin.shell.startsOn')}
              day={form.startsOn}
              time={form.startsTime}
              today={today}
              onChange={({ day, time }) => set({ startsOn: day, startsTime: time })}
              problem={shown('startsAt')}
              testID="notice-starts"
            />
          ) : null}
        </View>
      )}
      <View style={styles.group}>
        <FieldLabel>{words('admin.shell.ends')}</FieldLabel>
        <Segmented
          label={words('admin.shell.ends')}
          options={NOTICE_ENDS.map((ends) => ({ value: ends, label: NOTICE_ENDS_LABEL[ends] }))}
          value={form.ends}
          onChange={(ends) => {
            const week = localDayTime(new Date(start.getTime() + 7 * 86_400_000));
            set({ ends, endsOn: form.endsOn || week.day, endsTime: form.endsTime || week.time });
          }}
          // Four choices don't fit one row of the panel, or of a phone: two rows of two.
          perRow={2}
        />
        {form.ends === 'date' ? (
          <DayAndTime
            dayLabel={words('admin.shell.endsOn')}
            day={form.endsOn}
            time={form.endsTime}
            // Nothing before the day it starts, or before today.
            today={startDay > today ? startDay : today}
            onChange={({ day, time }) => set({ endsOn: day, endsTime: time })}
            problem={endsProblem}
            testID="notice-ends"
          />
        ) : endsProblem ? (
          <Alert message={endsProblem} />
        ) : null}
      </View>
    </>
  );
}

/**
 * When a notice starts or ends: its day in a DateField and its time in a
 * Select of half hours beside it, stacking where the two don't fit, with
 * what's wrong under both.
 */
function DayAndTime({
  dayLabel,
  day,
  time,
  today,
  onChange,
  problem,
  testID,
}: {
  dayLabel: string;
  day: string;
  time: string;
  today: string;
  onChange: (when: { day: string; time: string }) => void;
  problem?: string;
  testID: string;
}) {
  const words = useWords();
  return (
    <View style={styles.group}>
      <View style={styles.when}>
        <View style={styles.day}>
          <DateField label={dayLabel} value={day} onChange={(next) => onChange({ day: next, time })} today={today} testID={`${testID}-day`} />
        </View>
        <View style={styles.time}>
          <Select
            label={words('admin.shell.atTime')}
            options={noticeTimes(time).map((value) => ({ value, label: value }))}
            value={time}
            onChange={(next) => onChange({ day, time: next })}
            testID={`${testID}-time`}
          />
        </View>
      </View>
      {problem ? <Alert message={problem} /> : null}
    </View>
  );
}

/** The least each of a day and a time takes before they stack: the day's words with their year, a time's five figures. */
const DAY_LEAST = 200;
const TIME_LEAST = 120;

const styles = StyleSheet.create({
  form: { gap: SPACE.xl },
  group: { gap: SPACE.sm },
  when: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.md },
  day: { flexGrow: 2, flexBasis: DAY_LEAST, minWidth: 0 },
  time: { flexGrow: 1, flexBasis: TIME_LEAST, minWidth: 0 },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm },
  actions: { gap: SPACE.sm },
});
