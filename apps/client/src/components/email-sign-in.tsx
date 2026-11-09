import {
  codeProblem,
  EMAIL_SIGN_IN_COPY as COPY,
  emailAuthProblem,
  emailLooksRight,
  nameProblem,
  PASSWORD_MIN,
  passwordProblem,
  type EmailStep,
} from '@app/core';
import { useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import {
  confirmEmail,
  resendSignUpCode,
  resetPassword,
  sendPasswordReset,
  signInWithEmail,
  signUpWithEmail,
} from '@/api/email-auth';
import { Alert } from '@/components/alert';
import { BotCheck } from '@/components/bot-check';
import { Button } from '@/components/button';
import { CodeBoxes } from '@/components/code-boxes';
import { Field } from '@/components/field';
import { Group } from '@/components/group';
import { ChoiceRow } from '@/components/setup/choice-row';
import { HiddenUsername, SignInForm } from '@/components/sign-in-form';
import { Meta } from '@/components/text';
import { TextButton } from '@/components/text-button';
import { SPACE, useTheme } from '@/theme';

/** Enter on a phone's keyboard; the web form handles its own, so it isn't sent twice. */
const onPhone = (act: () => void) => (Platform.OS === 'web' ? undefined : act);

type Problem = { field?: 'name' | 'email' | 'password' | 'code'; message: string };

/**
 * The sign-in sign's email part, under Google and Microsoft: sign in with
 * an email and password, make an account (a 6-digit code by email proves
 * the address), or reset a forgotten password the same way. Signing in moves
 * on by itself, as any sign-in does.
 */
export function EmailSignIn() {
  const { colors } = useTheme();
  const [step, setStep] = useState<EmailStep>('sign-in');
  const [name, setName] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  /** Each try spends the bot check's token; a new round makes another. */
  const [round, setRound] = useState(0);

  function go(next: EmailStep) {
    setStep(next);
    setProblem(null);
    setNote(null);
    setCode('');
    if (next !== 'confirm') setPassword('');
  }

  /** Checks what's typed, then runs `act`; a refusal from Supabase becomes words. */
  async function run(checks: (Problem | null)[], act: () => Promise<void>) {
    const first = checks.find(Boolean);
    if (first) return setProblem(first);
    setBusy(true);
    setProblem(null);
    setNote(null);
    try {
      await act();
    } catch (reason) {
      console.warn('email sign-in failed', reason);
      const message = emailAuthProblem(reason as { code?: string; status?: number });
      // An unconfirmed account gets a fresh code, and the code step.
      if ((reason as { code?: string }).code === 'email_not_confirmed') {
        // With a fresh bot-check token, if there is one yet; else the code step's Send again does it.
        if (token) await resendSignUpCode(email, token).catch(() => undefined);
        setStep('confirm');
      }
      // A wrong or old code shows on the code boxes themselves.
      setProblem(message === COPY.wrongCode ? { field: 'code', message } : { message });
    } finally {
      setBusy(false);
    }
  }

  /**
   * Runs a step Supabase checks for bots (signing in, a new account, sending
   * a code): it needs Cloudflare's token, which works once, so the check
   * starts again straight away.
   */
  function checked(checks: (Problem | null)[], act: (captcha: string) => Promise<void>) {
    return run([...checks, token ? null : { message: COPY.notChecked }], async () => {
      const captcha = token as string;
      setToken(null);
      setRound((n) => n + 1);
      await act(captcha);
    });
  }

  const nameCheck = (): Problem | null => {
    const message = nameProblem(name);
    return message ? { field: 'name', message } : null;
  };
  const agreeCheck = (): Problem | null => (agreed ? null : { message: COPY.noAgree });
  const emailCheck = (): Problem | null => (emailLooksRight(email) ? null : { field: 'email', message: COPY.badEmail });
  const passwordCheck = (): Problem | null => {
    const message = passwordProblem(password);
    return message ? { field: 'password', message } : null;
  };
  const codeCheck = (): Problem | null => {
    const message = codeProblem(code);
    return message ? { field: 'code', message } : null;
  };
  const fieldProblem = (field: Problem['field']) => (problem && problem.field === field ? problem.message : undefined);

  const nameField = (
    <Field
      label={COPY.name}
      hint={COPY.nameHint}
      value={name}
      onChangeText={setName}
      problem={fieldProblem('name')}
      autoCapitalize="words"
      autoComplete="name"
      textContentType="name"
      nativeID="name"
      maxLength={60}
      returnKeyType="next"
      editable={!busy}
      testID="email-name"
    />
  );
  const emailField = (
    <Field
      label={COPY.email}
      value={email}
      onChangeText={setEmail}
      problem={fieldProblem('email')}
      keyboardType="email-address"
      autoCapitalize="none"
      autoCorrect={false}
      spellCheck={false}
      // "username", not "email": what password managers file a login under.
      autoComplete="username"
      textContentType="username"
      nativeID="email"
      returnKeyType={step === 'forgot' ? 'send' : 'next'}
      editable={!busy}
      testID="email-address"
    />
  );
  const codeField = (hint: string, onFilled?: (code: string) => void) => (
    <CodeBoxes
      label={COPY.code}
      hint={hint}
      value={code}
      onChangeText={setCode}
      onFilled={onFilled}
      problem={fieldProblem('code')}
      editable={!busy}
      autoFocus
      testID="email-code"
    />
  );
  const passwordField = (fresh: boolean) => (
    <Field
      label={step === 'reset' ? COPY.newPassword : COPY.password}
      hint={fresh ? COPY.passwordHint : undefined}
      value={password}
      onChangeText={setPassword}
      problem={fieldProblem('password')}
      secureTextEntry
      autoCapitalize="none"
      autoCorrect={false}
      spellCheck={false}
      autoComplete={fresh ? 'new-password' : 'current-password'}
      textContentType={fresh ? 'newPassword' : 'password'}
      // So iOS's suggested strong password passes our own check.
      passwordRules={fresh ? `minlength: ${PASSWORD_MIN};` : undefined}
      nativeID={fresh ? 'new-password' : 'password'}
      returnKeyType="go"
      onSubmitEditing={onPhone(submit)}
      editable={!busy}
      testID="email-password"
    />
  );
  const signIn = () => checked([emailCheck(), password ? null : passwordCheck()], (captcha) => signInWithEmail(email, password, captcha));
  const signUp = () =>
    checked([nameCheck(), emailCheck(), passwordCheck(), agreeCheck()], async (captcha) => {
      if ((await signUpWithEmail(email, password, name, captcha)) === 'code-sent') go('confirm');
    });
  const confirm = () => run([codeCheck()], () => confirmEmail(email, code));
  const forgot = () =>
    checked([emailCheck()], async (captcha) => {
      await sendPasswordReset(email, captcha);
      go('reset');
    });
  const reset = () => run([codeCheck(), passwordCheck()], () => resetPassword(email, code, password));
  /** What Enter (or a keyboard's Go) does on this step. */
  function submit() {
    if (busy) return;
    void { 'sign-in': signIn, 'sign-up': signUp, confirm, forgot, reset }[step]();
  }

  const loose = problem && !problem.field ? <Alert message={problem.message} /> : null;
  const told = note ? <Meta>{note}</Meta> : null;

  return (
    <View style={styles.email} testID="email-sign-in">
      <View style={styles.or}>
        <View style={[styles.line, { backgroundColor: colors.border }]} />
        <Meta>{COPY.or}</Meta>
        <View style={[styles.line, { backgroundColor: colors.border }]} />
      </View>

      {step === 'sign-in' ? (
        <SignInForm onSubmit={submit} style={styles.step}>
          {emailField}
          {passwordField(false)}
          {loose}
          <Button
            label={COPY.signIn}
            busyLabel={COPY.signInBusy}
            busy={busy}
            onPress={() => void signIn()}
            testID="email-sign-in-button"
          />
          <TextButton label={COPY.toForgot} align="start" onPress={() => go('forgot')} disabled={busy} />
          <TextButton label={COPY.toSignUp} align="start" onPress={() => go('sign-up')} disabled={busy} testID="to-sign-up" />
        </SignInForm>
      ) : null}

      {step === 'sign-up' ? (
        <SignInForm onSubmit={submit} style={styles.step}>
          {nameField}
          {emailField}
          {passwordField(true)}
          <Group testID="email-agree">
            <ChoiceRow
              role="checkbox"
              label={COPY.agree}
              meta={COPY.agreeMeta}
              checked={agreed}
              onPress={() => setAgreed((on) => !on)}
              disabled={busy}
              testID="email-agree-box"
            />
          </Group>
          {loose}
          <Button
            label={COPY.signUp}
            busyLabel={COPY.signUpBusy}
            busy={busy}
            onPress={() => void signUp()}
            testID="email-sign-up-button"
          />
          <TextButton label={COPY.toSignIn} align="start" onPress={() => go('sign-in')} disabled={busy} />
        </SignInForm>
      ) : null}

      {step === 'confirm' ? (
        <SignInForm onSubmit={submit} style={styles.step}>
          {codeField(COPY.codeHint(email.trim()), (typed) => void run([], () => confirmEmail(email, typed)))}
          <Meta>{COPY.existingHint}</Meta>
          {loose}
          {told}
          <Button
            label={COPY.confirm}
            busyLabel={COPY.confirmBusy}
            busy={busy}
            onPress={() => void confirm()}
            testID="email-confirm-button"
          />
          <TextButton
            label={COPY.resend}
            align="start"
            disabled={busy}
            onPress={() => void checked([], async (captcha) => {
              await resendSignUpCode(email, captcha);
              setNote(COPY.resent);
            })}
          />
          <TextButton label={COPY.back} align="start" onPress={() => go('sign-in')} disabled={busy} />
        </SignInForm>
      ) : null}

      {step === 'forgot' ? (
        <SignInForm onSubmit={submit} style={styles.step}>
          <Meta>{COPY.forgotBody}</Meta>
          {emailField}
          {loose}
          <Button
            label={COPY.sendReset}
            busyLabel={COPY.sendResetBusy}
            busy={busy}
            onPress={() => void forgot()}
            testID="email-forgot-button"
          />
          <TextButton label={COPY.back} align="start" onPress={() => go('sign-in')} disabled={busy} />
        </SignInForm>
      ) : null}

      {step === 'reset' ? (
        <SignInForm onSubmit={submit} style={styles.step}>
          <HiddenUsername email={email.trim()} />
          {codeField(COPY.resetBody(email.trim()))}
          {passwordField(true)}
          <Group testID="email-agree">
            <ChoiceRow
              role="checkbox"
              label={COPY.agree}
              meta={COPY.agreeMeta}
              checked={agreed}
              onPress={() => setAgreed((on) => !on)}
              disabled={busy}
              testID="email-agree-box"
            />
          </Group>
          {loose}
          {told}
          <Button
            label={COPY.reset}
            busyLabel={COPY.resetBusy}
            busy={busy}
            onPress={() => void reset()}
            testID="email-reset-button"
          />
          <TextButton
            label={COPY.resend}
            align="start"
            disabled={busy}
            onPress={() => void checked([], async (captcha) => {
              await sendPasswordReset(email, captcha);
              setNote(COPY.resent);
            })}
          />
          <TextButton label={COPY.back} align="start" onPress={() => go('sign-in')} disabled={busy} />
        </SignInForm>
      ) : null}
      <BotCheck round={round} onToken={setToken} />
    </View>
  );
}

const styles = StyleSheet.create({
  email: { gap: SPACE.sm, marginTop: SPACE.sm },
  step: { gap: SPACE.sm },
  or: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  line: { flex: 1, height: StyleSheet.hairlineWidth },
});
