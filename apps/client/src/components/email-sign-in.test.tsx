import { CODE_LENGTH, PASSWORD_MIN, wordsFor } from '@app/core';
import { fireEvent, render, screen } from '@testing-library/react-native';

import {
  confirmEmail,
  resendSignUpCode,
  resetPassword,
  sendPasswordReset,
  signInWithEmail,
  signUpWithEmail,
} from '@/api/email-auth';

import { EmailSignIn } from './email-sign-in';

const words = wordsFor('en', 'housemates');

jest.mock('@/api/email-auth', () => ({
  confirmEmail: jest.fn(),
  resendSignUpCode: jest.fn(),
  resetPassword: jest.fn(),
  sendPasswordReset: jest.fn(),
  signInWithEmail: jest.fn(),
  signUpWithEmail: jest.fn(),
}));

const type = (testID: string, text: string) => fireEvent.changeText(screen.getByTestId(testID), text);

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

it('signs in with an email and password', async () => {
  (signInWithEmail as jest.Mock).mockResolvedValue(undefined);
  await render(<EmailSignIn />);
  await type('email-address', 'sam@example.com');
  await type('email-password', 'correct horse');
  await fireEvent.press(screen.getByRole('button', { name: words('door.email.signIn') }));
  expect(signInWithEmail).toHaveBeenCalledWith('sam@example.com', 'correct horse', 'test-token');
  expect(screen.queryByRole('alert')).toBeNull();
});

it('checks the address before asking, and says when the password is wrong', async () => {
  (signInWithEmail as jest.Mock).mockRejectedValue({ code: 'invalid_credentials', status: 400 });
  await render(<EmailSignIn />);
  await type('email-address', 'sam@example');
  await fireEvent.press(screen.getByRole('button', { name: words('door.email.signIn') }));
  expect(signInWithEmail).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toHaveTextContent(words('door.email.badEmail'));
  await type('email-address', 'sam@example.com');
  await type('email-password', 'wrong one');
  await fireEvent.press(screen.getByRole('button', { name: words('door.email.signIn') }));
  expect(screen.getByRole('alert')).toHaveTextContent(words('door.email.wrongPassword'));
});

it('makes an account, then checks the emailed code as soon as its sixth digit is in', async () => {
  (signUpWithEmail as jest.Mock).mockResolvedValue('code-sent');
  (confirmEmail as jest.Mock).mockResolvedValue(undefined);
  await render(<EmailSignIn />);
  await fireEvent.press(screen.getByRole('button', { name: words('door.email.toSignUp') }));
  await type('email-name', 'Sam');
  await fireEvent.press(screen.getByTestId('email-agree-box'));
  await type('email-address', 'sam@example.com');
  await type('email-password', 'short');
  await fireEvent.press(screen.getByRole('button', { name: words('door.email.signUp') }));
  expect(signUpWithEmail).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toHaveTextContent(words("door.email.shortPassword", { min: PASSWORD_MIN }));
  await type('email-password', 'long enough');
  await fireEvent.press(screen.getByRole('button', { name: words('door.email.signUp') }));
  expect(signUpWithEmail).toHaveBeenCalledWith('sam@example.com', 'long enough', 'Sam', 'test-token');
  expect(screen.getByText(words("door.email.codeHint", { length: CODE_LENGTH, email: 'sam@example.com' }))).toBeOnTheScreen();
  expect(screen.getByText(words('door.email.existingHint'))).toBeOnTheScreen();
  await type('email-code', '123 45');
  expect(confirmEmail).not.toHaveBeenCalled();
  // Pasted or filled in for you, with its space: checked without a tap.
  await type('email-code', '123 456');
  expect(confirmEmail).toHaveBeenCalledTimes(1);
  expect(confirmEmail).toHaveBeenCalledWith('sam@example.com', '123456');
});

it('sends a new sign-up code, and says a wrong one is wrong', async () => {
  (signUpWithEmail as jest.Mock).mockResolvedValue('code-sent');
  (confirmEmail as jest.Mock).mockRejectedValue({ code: 'otp_expired', status: 403 });
  (resendSignUpCode as jest.Mock).mockResolvedValue(undefined);
  await render(<EmailSignIn />);
  await fireEvent.press(screen.getByRole('button', { name: words('door.email.toSignUp') }));
  await type('email-name', 'Sam');
  await fireEvent.press(screen.getByTestId('email-agree-box'));
  await type('email-address', 'sam@example.com');
  await type('email-password', 'long enough');
  await fireEvent.press(screen.getByRole('button', { name: words('door.email.signUp') }));
  await type('email-code', '000000');
  expect(confirmEmail).toHaveBeenCalledWith('sam@example.com', '000000');
  // On the code boxes, where the code is, and the next digit starts it over.
  expect(screen.getByRole('alert')).toHaveTextContent(words('door.email.wrongCode'));
  await type('email-code', '0000007');
  expect(screen.getByTestId('email-code').props.value).toBe('7');
  await fireEvent.press(screen.getByRole('button', { name: words('door.email.resend') }));
  expect(resendSignUpCode).toHaveBeenCalledWith('sam@example.com', 'test-token');
  expect(screen.getByText(words('door.email.resent'))).toBeOnTheScreen();
});

it('resets a forgotten password with an emailed code', async () => {
  (sendPasswordReset as jest.Mock).mockResolvedValue(undefined);
  (resetPassword as jest.Mock).mockResolvedValue(undefined);
  await render(<EmailSignIn />);
  await fireEvent.press(screen.getByRole('button', { name: words('door.email.toForgot') }));
  await type('email-address', 'sam@example.com');
  await fireEvent.press(screen.getByRole('button', { name: words('door.email.sendReset') }));
  expect(sendPasswordReset).toHaveBeenCalledWith('sam@example.com', 'test-token');
  expect(screen.getByText(words("door.email.resetBody", { length: CODE_LENGTH, email: 'sam@example.com' }))).toBeOnTheScreen();
  await type('email-code', '654321');
  await type('email-password', 'a new one please');
  await fireEvent.press(screen.getByRole('button', { name: words('door.email.reset') }));
  expect(resetPassword).toHaveBeenCalledWith('sam@example.com', '654321', 'a new one please');
});

it('says when a reset could not save the password because the account has an authenticator app', async () => {
  (sendPasswordReset as jest.Mock).mockResolvedValue(undefined);
  (resetPassword as jest.Mock).mockRejectedValue({ code: 'insufficient_aal', status: 401 });
  await render(<EmailSignIn />);
  await fireEvent.press(screen.getByRole('button', { name: words('door.email.toForgot') }));
  await type('email-address', 'sam@example.com');
  await fireEvent.press(screen.getByRole('button', { name: words('door.email.sendReset') }));
  await type('email-code', '654321');
  await type('email-password', 'a new one please');
  await fireEvent.press(screen.getByRole('button', { name: words('door.email.reset') }));
  expect(screen.getByRole('alert')).toHaveTextContent(words('door.email.needsAuthenticator'));
});

it('says email sign-in is not open yet, where production still has it off', async () => {
  (signUpWithEmail as jest.Mock).mockRejectedValue({ code: 'signup_disabled', status: 422 });
  await render(<EmailSignIn />);
  await fireEvent.press(screen.getByRole('button', { name: words('door.email.toSignUp') }));
  await type('email-name', 'Sam');
  await fireEvent.press(screen.getByTestId('email-agree-box'));
  await type('email-address', 'sam@example.com');
  await type('email-password', 'long enough');
  await fireEvent.press(screen.getByRole('button', { name: words('door.email.signUp') }));
  expect(screen.getByRole('alert')).toHaveTextContent(words('door.email.notOpen'));
});

it('fills like any login: the keyboard sends it, and password managers know which box is which', async () => {
  (signUpWithEmail as jest.Mock).mockResolvedValue('code-sent');
  await render(<EmailSignIn />);
  expect(screen.getByTestId('email-address')).toHaveProp('autoComplete', 'username');
  expect(screen.getByTestId('email-password')).toHaveProp('autoComplete', 'current-password');
  await fireEvent.press(screen.getByTestId('to-sign-up'));
  await type('email-name', 'Sam');
  await fireEvent.press(screen.getByTestId('email-agree-box'));
  const password = screen.getByTestId('email-password');
  expect(password).toHaveProp('autoComplete', 'new-password');
  expect(password).toHaveProp('passwordRules', 'minlength: 8;');
  await type('email-address', 'sam@example.com');
  await type('email-password', 'correct horse');
  await fireEvent(screen.getByTestId('email-password'), 'submitEditing');
  expect(signUpWithEmail).toHaveBeenCalledWith('sam@example.com', 'correct horse', 'Sam', 'test-token');
});

it('asks a new account for the name housemates will see', async () => {
  await render(<EmailSignIn />);
  await fireEvent.press(screen.getByTestId('to-sign-up'));
  expect(screen.getByTestId('email-name')).toHaveProp('autoComplete', 'name');
  await type('email-address', 'sam@example.com');
  await type('email-password', 'correct horse');
  await fireEvent.press(screen.getByRole('button', { name: words('door.email.signUp') }));
  expect(signUpWithEmail).not.toHaveBeenCalled();
  expect(screen.getByText(words('door.email.noName'))).toBeOnTheScreen();
});

it('makes an account only once the Terms box is ticked, and keeps which Terms', async () => {
  (signUpWithEmail as jest.Mock).mockResolvedValue('code-sent');
  await render(<EmailSignIn />);
  await fireEvent.press(screen.getByTestId('to-sign-up'));
  await type('email-name', 'Sam');
  await type('email-address', 'sam@example.com');
  await type('email-password', 'correct horse');
  const box = screen.getByRole('checkbox', { name: new RegExp(words('door.email.agree')) });
  expect(box).not.toBeChecked();
  await fireEvent.press(screen.getByRole('button', { name: words('door.email.signUp') }));
  expect(signUpWithEmail).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toHaveTextContent(words('door.email.noAgree'));
  await fireEvent.press(box);
  expect(box).toBeChecked();
  await fireEvent.press(screen.getByRole('button', { name: words('door.email.signUp') }));
  expect(signUpWithEmail).toHaveBeenCalledWith('sam@example.com', 'correct horse', 'Sam', 'test-token');
});

it('waits for the bot check before asking Supabase', async () => {
  const bot = jest.requireMock('./bot-check') as { BotCheck: unknown };
  const real = bot.BotCheck;
  bot.BotCheck = function UnfinishedCheck() {
    return null; // a check that hasn't finished: no token yet
  };
  try {
    await render(<EmailSignIn />);
    await type('email-address', 'sam@example.com');
    await type('email-password', 'correct horse');
    await fireEvent.press(screen.getByRole('button', { name: words('door.email.signIn') }));
    expect(signInWithEmail).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent(words('door.email.notChecked'));
  } finally {
    bot.BotCheck = real;
  }
});
