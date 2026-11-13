import {
  CODE_LENGTH,
  codeProblem,
  emailAuthProblem,
  emailLooksRight,
  nameProblem,
  PASSWORD_MIN,
  passwordProblem,
  type EmailStep,
} from '@app/core';
import { useState, type ComponentType } from 'react';
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
import { useWords } from '@/hooks/use-words';

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
  const words = useWords();
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
      const message = emailAuthProblem(reason as { code?: string; status?: number }, words);
      // An unconfirmed account gets a fresh code, and the code step.
      if ((reason as { code?: string }).code === 'email_not_confirmed') {
        // With a fresh bot-check token, if there is one yet; else the code step's Send again does it.
        if (token) await resendSignUpCode(email, token).catch(() => undefined);
        setStep('confirm');
      }
      // A wrong or old code shows on the code boxes themselves.
      setProblem(message === words('door.email.wrongCode') ? { field: 'code', message } : { message });
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
    return run([...checks, token ? null : { message: words('door.email.notChecked') }], async () => {
      const captcha = token as string;
      setToken(null);
      setRound((n) => n + 1);
      await act(captcha);
    });
  }

  const nameCheck = (): Problem | null => {
    const message = nameProblem(name, words);
    return message ? { field: 'name', message } : null;
  };
  const agreeCheck = (): Problem | null => (agreed ? null : { message: words('door.email.noAgree') });
  const emailCheck = (): Problem | null => (emailLooksRight(email) ? null : { field: 'email', message: words('door.email.badEmail') });
  const passwordCheck = (): Problem | null => {
    const message = passwordProblem(password, words);
    return message ? { field: 'password', message } : null;
  };
  const codeCheck = (): Problem | null => {
    const message = codeProblem(code, words);
    return message ? { field: 'code', message } : null;
  };
  const fieldProblem = (field: Problem['field']) => (problem && problem.field === field ? problem.message : undefined);

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

  const Step = STEPS[step];
  const flow: Flow = {
    step,
    busy,
    typed: { name, email, password, code, agreed },
    type: { name: setName, email: setEmail, password: setPassword, code: setCode, agreed: setAgreed },
    fieldProblem,
    loose: problem && !problem.field ? problem.message : null,
    note,
    setNote,
    go,
    run,
    checked,
    submit,
    acts: { signIn, signUp, confirm, forgot, reset },
  };

  return (
    <View style={styles.email} testID="email-sign-in">
      <View style={styles.or}>
        <View style={[styles.line, { backgroundColor: colors.border }]} />
        <Meta>{words('door.email.or')}</Meta>
        <View style={[styles.line, { backgroundColor: colors.border }]} />
      </View>
      <Step flow={flow} />
      <BotCheck round={round} onToken={setToken} />
    </View>
  );
}

/** What every step and field of the email sign-in is drawn from. */
interface Flow {
  step: EmailStep;
  busy: boolean;
  typed: { name: string; email: string; password: string; code: string; agreed: boolean };
  type: {
    name: (text: string) => void;
    email: (text: string) => void;
    password: (text: string) => void;
    code: (text: string) => void;
    agreed: (change: (on: boolean) => boolean) => void;
  };
  fieldProblem: (field: Problem['field']) => string | undefined;
  /** A problem no field owns. */
  loose: string | null;
  note: string | null;
  setNote: (note: string) => void;
  go: (next: EmailStep) => void;
  run: (checks: (Problem | null)[], act: () => Promise<void>) => Promise<void>;
  checked: (checks: (Problem | null)[], act: (captcha: string) => Promise<void>) => Promise<void>;
  /** What Enter (or a keyboard's Go) does on this step. */
  submit: () => void;
  acts: Record<'signIn' | 'signUp' | 'confirm' | 'forgot' | 'reset', () => Promise<void>>;
}

/** Sign in with an email and password. */
function SignInStep({ flow }: { flow: Flow }) {
  const words = useWords();
  const { busy, loose, go, submit, acts } = flow;
  return (
    <SignInForm onSubmit={submit} style={styles.step}>
      <EmailField flow={flow} />
      <PasswordField flow={flow} />
      {loose ? <Alert message={loose} /> : null}
      <Button
        label={words('door.email.signIn')}
        busyLabel={words('door.email.signInBusy')}
        busy={busy}
        onPress={() => void acts.signIn()}
        testID="email-sign-in-button"
      />
      <TextButton label={words('door.email.toForgot')} align="start" onPress={() => go('forgot')} disabled={busy} />
      <TextButton label={words('door.email.toSignUp')} align="start" onPress={() => go('sign-up')} disabled={busy} testID="to-sign-up" />
    </SignInForm>
  );
}

/** Make an account: a name, an email, a password, and the agreement. */
function SignUpStep({ flow }: { flow: Flow }) {
  const words = useWords();
  const { busy, loose, go, submit, acts } = flow;
  return (
    <SignInForm onSubmit={submit} style={styles.step}>
      <NameField flow={flow} />
      <EmailField flow={flow} />
      <PasswordField flow={flow} fresh />
      <AgreeBox flow={flow} />
      {loose ? <Alert message={loose} /> : null}
      <Button
        label={words('door.email.signUp')}
        busyLabel={words('door.email.signUpBusy')}
        busy={busy}
        onPress={() => void acts.signUp()}
        testID="email-sign-up-button"
      />
      <TextButton label={words('door.email.toSignIn')} align="start" onPress={() => go('sign-in')} disabled={busy} />
    </SignInForm>
  );
}

/** Prove the address with the code sent to it; the last box filled sends it. */
function ConfirmStep({ flow }: { flow: Flow }) {
  const words = useWords();
  const { busy, typed, loose, note, go, run, checked, submit, acts, setNote } = flow;
  return (
    <SignInForm onSubmit={submit} style={styles.step}>
      <CodeField flow={flow} hint={words("door.email.codeHint", { length: CODE_LENGTH, email: typed.email.trim() })} onFilled={(filled) => void run([], () => confirmEmail(typed.email, filled))} />
      <Meta>{words('door.email.existingHint')}</Meta>
      {loose ? <Alert message={loose} /> : null}
      {note ? <Meta>{note}</Meta> : null}
      <Button
        label={words('door.email.confirm')}
        busyLabel={words('door.email.confirmBusy')}
        busy={busy}
        onPress={() => void acts.confirm()}
        testID="email-confirm-button"
      />
      <TextButton
        label={words('door.email.resend')}
        align="start"
        disabled={busy}
        onPress={() => void checked([], async (captcha) => {
          await resendSignUpCode(typed.email, captcha);
          setNote(words('door.email.resent'));
        })}
      />
      <TextButton label={words('door.email.back')} align="start" onPress={() => go('sign-in')} disabled={busy} />
    </SignInForm>
  );
}

/** Ask for a code to reset a forgotten password. */
function ForgotStep({ flow }: { flow: Flow }) {
  const words = useWords();
  const { busy, loose, go, submit, acts } = flow;
  return (
    <SignInForm onSubmit={submit} style={styles.step}>
      <Meta>{words('door.email.forgotBody')}</Meta>
      <EmailField flow={flow} />
      {loose ? <Alert message={loose} /> : null}
      <Button
        label={words('door.email.sendReset')}
        busyLabel={words('door.email.sendResetBusy')}
        busy={busy}
        onPress={() => void acts.forgot()}
        testID="email-forgot-button"
      />
      <TextButton label={words('door.email.back')} align="start" onPress={() => go('sign-in')} disabled={busy} />
    </SignInForm>
  );
}

/** Reset the password with the code sent by email. */
function ResetStep({ flow }: { flow: Flow }) {
  const words = useWords();
  const { busy, typed, loose, note, go, checked, submit, acts, setNote } = flow;
  return (
    <SignInForm onSubmit={submit} style={styles.step}>
      <HiddenUsername email={typed.email.trim()} />
      <CodeField flow={flow} hint={words("door.email.resetBody", { length: CODE_LENGTH, email: typed.email.trim() })} />
      <PasswordField flow={flow} fresh />
      <AgreeBox flow={flow} />
      {loose ? <Alert message={loose} /> : null}
      {note ? <Meta>{note}</Meta> : null}
      <Button
        label={words('door.email.reset')}
        busyLabel={words('door.email.resetBusy')}
        busy={busy}
        onPress={() => void acts.reset()}
        testID="email-reset-button"
      />
      <TextButton
        label={words('door.email.resend')}
        align="start"
        disabled={busy}
        onPress={() => void checked([], async (captcha) => {
          await sendPasswordReset(typed.email, captcha);
          setNote(words('door.email.resent'));
        })}
      />
      <TextButton label={words('door.email.back')} align="start" onPress={() => go('sign-in')} disabled={busy} />
    </SignInForm>
  );
}

const STEPS: Record<EmailStep, ComponentType<{ flow: Flow }>> = {
  'sign-in': SignInStep,
  'sign-up': SignUpStep,
  confirm: ConfirmStep,
  forgot: ForgotStep,
  reset: ResetStep,
};

function NameField({ flow }: { flow: Flow }) {
  const words = useWords();
  const { busy, typed, type, fieldProblem } = flow;
  return (
    <Field
      label={words('door.email.name')}
      hint={words('door.email.nameHint')}
      value={typed.name}
      onChangeText={type.name}
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
}

function EmailField({ flow }: { flow: Flow }) {
  const words = useWords();
  const { busy, typed, type, fieldProblem } = flow;
  return (
    <Field
      label={words('door.email.email')}
      value={typed.email}
      onChangeText={type.email}
      problem={fieldProblem('email')}
      keyboardType="email-address"
      autoCapitalize="none"
      autoCorrect={false}
      spellCheck={false}
      // "username", not "email": what password managers file a login under.
      autoComplete="username"
      textContentType="username"
      nativeID="email"
      returnKeyType={flow.step === 'forgot' ? 'send' : 'next'}
      editable={!busy}
      testID="email-address"
    />
  );
}

/** The code's boxes; `onFilled` when the last box filled sends it. */
function CodeField({ flow, hint, onFilled }: { flow: Flow; hint: string; onFilled?: (code: string) => void }) {
  const words = useWords();
  const { busy, typed, type, fieldProblem } = flow;
  return (
    <CodeBoxes
      label={words('door.email.code')}
      hint={hint}
      value={typed.code}
      onChangeText={type.code}
      onFilled={onFilled}
      problem={fieldProblem('code')}
      editable={!busy}
      autoFocus
      testID="email-code"
    />
  );
}

/** The password: `fresh` for one being chosen (a new account, a reset), with what it must be. */
function PasswordField({ flow, fresh = false }: { flow: Flow; fresh?: boolean }) {
  const words = useWords();
  const { busy, typed, type, fieldProblem } = flow;
  return (
    <Field
      label={flow.step === 'reset' ? words('door.email.newPassword') : words('door.email.password')}
      hint={fresh ? words("door.email.passwordHint", { min: PASSWORD_MIN }) : undefined}
      value={typed.password}
      onChangeText={type.password}
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
      onSubmitEditing={onPhone(flow.submit)}
      editable={!busy}
      testID="email-password"
    />
  );
}

function AgreeBox({ flow }: { flow: Flow }) {
  const words = useWords();
  const { busy, typed, type } = flow;
  return (
    <Group testID="email-agree">
      <ChoiceRow
        role="checkbox"
        label={words('door.email.agree')}
        meta={words('door.email.agreeMeta')}
        checked={typed.agreed}
        onPress={() => type.agreed((on) => !on)}
        disabled={busy}
        testID="email-agree-box"
      />
    </Group>
  );
}

const styles = StyleSheet.create({
  email: { gap: SPACE.sm, marginTop: SPACE.sm },
  step: { gap: SPACE.sm },
  or: { flexDirection: 'row', alignItems: 'center', gap: SPACE.sm },
  line: { flex: 1, height: StyleSheet.hairlineWidth },
});
