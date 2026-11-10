import { Redirect, useRouter } from 'expo-router';

import { MessageForm } from '@/components/admin/message-form';
import { useOwnerMay } from '@/components/admin/use-owner-may';
import { Screen, useColumns } from '@/components/screen';
import { TitleBar } from '@/components/title-bar';
import { useWords } from '@/hooks/use-words';

/**
 * A new message as a page of its own, on a phone: pushed from Messages'
 * New message, and back to the list once it's sent. A laptop writes it in
 * Messages' side panel, so this lands there, as it does for someone whose
 * app role can't send.
 */
export default function NewMessagePage() {
  const words = useWords();
  return (
    <Screen spreads bar={<TitleBar title={words('admin.messages.newMessage')} back={'/admin/messages' as never} backLabel={words('admin.messages.page')} />} testID="admin-message-new">
      <NewMessage />
    </Screen>
  );
}

function NewMessage() {
  // The same test Messages makes: in two columns the form is in its panel.
  const two = useColumns();
  const may = useOwnerMay('messages:write');
  const router = useRouter();
  if (two || !may) return <Redirect href={'/admin/messages' as never} />;
  return <MessageForm onSent={() => router.dismissTo('/admin/messages' as never)} />;
}
