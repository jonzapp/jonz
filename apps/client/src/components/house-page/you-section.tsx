import { dateRange, DELETE_COPY, EMAIL_SIGN_IN_COPY, emailAuthProblem, HOUSE_COPY, HOUSE_LOWER_COPY, LOOK_LABEL, LOOKS, ME_COPY, MOVING_COPY, PASSWORD_MIN, PASSWORD_SETTING_COPY, passwordProblem, prefsLine, STEADY_COPY } from '@app/core';
import { BellIcon, KeyRoundIcon, LogOutIcon, SlidersHorizontalIcon, SunMoonIcon, Trash2Icon, TruckIcon } from 'lucide-react-native';
import { useCallback, useEffect, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { signOut } from '@/api/auth';
import { emailSignIn, setPassword } from '@/api/email-auth';
import { renameMe } from '@/api/profile';
import { reminderSupport, remindersOn } from '@/api/push';
import { DeleteAccountForm } from '@/components/account/delete-account';
import { Alert } from '@/components/alert';
import { Avatar } from '@/components/avatar';
import { Button } from '@/components/button';
import { Field } from '@/components/field';
import { Reminders } from '@/components/house/reminders';
import { useHouseWorkspace } from '@/components/house/workspace';
import { HelpSection } from '@/components/house-page/help-section';
import { PendingMeta } from '@/components/house-page/setup-section';
import { Row, RowIcon } from '@/components/row';
import { Section } from '@/components/section';
import { Segmented } from '@/components/segmented';
import { Sheet } from '@/components/sheet';
import { HiddenUsername, SignInForm } from '@/components/sign-in-form';
import { Meta } from '@/components/text';
import { useLook } from '@/hooks/look';
import type { HouseView } from '@/hooks/use-house';
import { useMove } from '@/hooks/use-move';
import { INSET, SECTION_GAP, SPACE, useTheme } from '@/theme';

const LOOK_OPTIONS = LOOKS.map((value) => ({ value, label: LOOK_LABEL[value] }));

/**
 * You: your name (a sheet to change it), reminders on this device (a sheet
 * holding their switch, where there are any to offer), your preferences in
 * this house (their own page; on a laptop it's in the list beside House
 * instead), the look in the row itself, a password to sign in with by
 * email (a sheet), and signing out. Reminders and the look are this
 * device's own. Then Leave: your moving-out date (its own page) and Delete
 * my account, in hazard (a sheet), with a line saying it's on the web too.
 * The You page shows it whole on a phone; on a laptop `account` (You) and
 * `rest` (help and Leave) sit side by side.
 */
export function YouSection({
  houseId,
  userId,
  view,
  part = 'all',
}: {
  houseId: string;
  userId: string;
  view: HouseView;
  part?: 'all' | 'account' | 'rest';
}) {
  const [look, setLook] = useLook();
  const { colors } = useTheme();
  const [sheet, setSheet] = useState<'name' | 'reminders' | 'password' | 'delete' | null>(null);
  const account = useEmailSignIn(sheet);
  const email = account?.email ?? null;
  const hasPassword = account?.hasPassword ?? false;
  // Each opening of the name sheet starts from the name as it is.
  const [opened, setOpened] = useState(0);
  const reminders = useReminderState();
  const [signingOut, setSigningOut] = useState(false);
  const { listed } = useHouseWorkspace();

  if (!view.me) return null;
  const name = view.me.name;
  const movingOutOn = view.snapshot.members.find((m) => m.userId === userId)?.movingOutOn ?? null;

  async function out() {
    setSigningOut(true);
    try {
      await signOut();
    } catch (reason) {
      // The guard moves on once the session is gone; anything else, try again.
      console.warn('Sign out failed', reason);
      setSigningOut(false);
    }
  }

  return (
    <View testID={part === 'rest' ? 'you-rest' : 'you-section'} style={styles.sections}>
      {part === 'rest' ? null : (
        <Section label={HOUSE_COPY.you}>
          <Row
            leading={<Avatar name={name} userId={userId} me />}
            title={HOUSE_LOWER_COPY.name}
            meta={name}
            onPress={() => {
              setOpened((n) => n + 1);
              setSheet('name');
            }}
            chevron
            testID="to-name"
          />
          {reminders.support === 'none' ? null : (
            <Row
              leading={<RowIcon icon={BellIcon} />}
              title={HOUSE_LOWER_COPY.reminders}
              meta={reminders.on === null ? <PendingMeta /> : reminders.on ? HOUSE_LOWER_COPY.on : HOUSE_LOWER_COPY.off}
              onPress={() => setSheet('reminders')}
              chevron
              testID="to-reminders"
            />
          )}
          {listed ? null : (
            <Row
              leading={<RowIcon icon={SlidersHorizontalIcon} />}
              title={STEADY_COPY.prefs}
              meta={prefsLine(view.me.prefs)}
              href="/house/away"
              chevron
              testID="to-prefs"
            />
          )}
          <Row
            leading={<RowIcon icon={SunMoonIcon} />}
            title={HOUSE_LOWER_COPY.look}
            trailing={<Segmented options={LOOK_OPTIONS} value={look} onChange={setLook} label={ME_COPY.look} testID="look" />}
          />
          {email ? (
            <Row
              leading={<RowIcon icon={KeyRoundIcon} />}
              title={PASSWORD_SETTING_COPY.label}
              meta={hasPassword ? PASSWORD_SETTING_COPY.change : PASSWORD_SETTING_COPY.add}
              onPress={() => {
                setOpened((n) => n + 1);
                setSheet('password');
              }}
              chevron
              testID="to-password"
            />
          ) : null}
          <Row
            leading={<RowIcon icon={LogOutIcon} />}
            title={HOUSE_LOWER_COPY.signOut}
            onPress={() => void out()}
            disabled={signingOut}
            testID="sign-out"
          />
        </Section>
      )}

      {part === 'account' ? null : <HelpSection house={view.snapshot.house.name} />}

      {part === 'account' ? null : (
        <View style={styles.leave}>
          <Section label={DELETE_COPY.leave}>
            <Row
              leading={<RowIcon icon={TruckIcon} />}
              title={MOVING_COPY.row}
              meta={movingOutOn ? dateRange(movingOutOn, movingOutOn) : MOVING_COPY.notPlanned}
              href="/house/moving"
              chevron
              testID="to-moving"
            />
            <Row
              leading={<Trash2Icon size={24} color={colors.hazard} aria-hidden />}
              title={DELETE_COPY.row}
              tone="hazard"
              onPress={() => setSheet('delete')}
              testID="to-delete-account"
            />
          </Section>
          <Meta style={styles.elsewhere}>{DELETE_COPY.elsewhere}</Meta>
        </View>
      )}

      <NameSheet
        key={opened}
        visible={sheet === 'name'}
        houseId={houseId}
        userId={userId}
        name={name}
        onClose={() => setSheet(null)}
      />
      <Sheet
        visible={sheet === 'reminders'}
        title={HOUSE_LOWER_COPY.reminders}
        onClose={() => setSheet(null)}
        onDismissed={reminders.read}
        testID="reminders-sheet"
      >
        {/* The sheet's title says Reminders, so the control doesn't again. */}
        <Reminders userId={userId} labelled={false} />
      </Sheet>
      {email ? (
        <PasswordSheet
          key={`password-${opened}`}
          visible={sheet === 'password'}
          email={email}
          hasPassword={hasPassword}
          onClose={() => setSheet(null)}
        />
      ) : null}
      <Sheet visible={sheet === 'delete'} title={DELETE_COPY.title} onClose={() => setSheet(null)} testID="delete-sheet">
        <DeleteAccountForm onKeep={() => setSheet(null)} />
      </Sheet>
    </View>
  );
}

/** Your sign-in email and whether it has a password, read again whenever a sheet closes. */
function useEmailSignIn(sheet: string | null) {
  const [account, setAccount] = useState<{ email: string; hasPassword: boolean } | null>(null);
  useEffect(() => {
    if (sheet) return;
    let active = true;
    emailSignIn()
      .then((next) => {
        if (active) setAccount(next);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [sheet]);
  return account;
}

/** Whether this device offers reminders, and whether they're on now (null until asked). */
function useReminderState() {
  const support = reminderSupport();
  const [on, setOn] = useState<boolean | null>(support === 'ready' ? null : false);
  // Asked as You comes up, and again once the reminders sheet is put away.
  const read = useCallback(() => {
    if (support === 'ready') void remindersOn().then(setOn);
  }, [support]);
  useEffect(read, [read]);
  return { support, on, read };
}

/** Your name, changed in a sheet: the field, any refusal, and Save, the sheet's one amber button. */
function NameSheet({
  visible,
  houseId,
  userId,
  name,
  onClose,
}: {
  visible: boolean;
  houseId: string;
  userId: string;
  name: string;
  onClose: () => void;
}) {
  const move = useMove(houseId);
  const [value, setValue] = useState(name);

  const unchanged = value.trim() === name;

  async function save() {
    // The keyboard's return key comes here too, Save held or not.
    if (move.pending || unchanged) return;
    if (await move.run(() => renameMe(userId, value))) onClose();
  }

  return (
    <Sheet visible={visible} title={HOUSE_LOWER_COPY.rename} onClose={onClose} testID="name-sheet">
      <Field
        label={ME_COPY.name}
        value={value}
        onChangeText={setValue}
        maxLength={60}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={() => void save()}
        testID="my-name"
      />
      {move.problem ? <Alert message={move.problem} /> : null}
      <Button
        label={HOUSE_LOWER_COPY.save}
        disabled={move.pending || unchanged}
        onPress={() => void save()}
        testID="save-name"
      />
    </Sheet>
  );
}

/**
 * A password beside Google, Microsoft or Apple, or a new one: one field and
 * Save. Supabase holds it; the next sign-in by email uses it.
 */
function PasswordSheet({
  visible,
  email,
  hasPassword,
  onClose,
}: {
  visible: boolean;
  email: string;
  hasPassword: boolean;
  onClose: () => void;
}) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save() {
    if (busy) return;
    const short = passwordProblem(value);
    if (short) return setProblem(short);
    setBusy(true);
    setProblem(null);
    try {
      await setPassword(value);
      setSaved(true);
      setValue('');
    } catch (reason) {
      console.warn('Saving the password failed', reason);
      setProblem(emailAuthProblem(reason as { code?: string; status?: number }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      visible={visible}
      title={hasPassword ? PASSWORD_SETTING_COPY.change : PASSWORD_SETTING_COPY.add}
      onClose={onClose}
      testID="password-sheet"
    >
      <Meta>{hasPassword ? PASSWORD_SETTING_COPY.changeBody(email) : PASSWORD_SETTING_COPY.addBody(email)}</Meta>
      <SignInForm onSubmit={() => void save()} style={styles.leave}>
        <HiddenUsername email={email} />
        <Field
          label={EMAIL_SIGN_IN_COPY.newPassword}
          hint={EMAIL_SIGN_IN_COPY.passwordHint}
          value={value}
          onChangeText={(text) => {
            setValue(text);
            setSaved(false);
          }}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          autoComplete="new-password"
          textContentType="newPassword"
          passwordRules={`minlength: ${PASSWORD_MIN};`}
          nativeID="new-password"
          returnKeyType="done"
          // The web form sends itself on Enter.
          onSubmitEditing={Platform.OS === 'web' ? undefined : () => void save()}
          testID="new-password"
        />
        {problem ? <Alert message={problem} /> : saved ? <Meta>{PASSWORD_SETTING_COPY.saved}</Meta> : null}
        <Button
          label={busy ? PASSWORD_SETTING_COPY.busy : PASSWORD_SETTING_COPY.save}
          disabled={busy || value.length === 0}
          onPress={() => void save()}
          testID="save-password"
        />
      </SignInForm>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  sections: { gap: SECTION_GAP },
  leave: { gap: SPACE.sm },
  elsewhere: { paddingLeft: INSET },
});
