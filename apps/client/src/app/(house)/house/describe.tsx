import { SECTION_LABEL } from '@app/core';

import { AskJonz } from '@/components/house/ask-jonz';
import { PageTitle } from '@/components/page-title';
import { TitleBar } from '@/components/title-bar';
import { useMembership } from '@/hooks/use-membership';

/**
 * The chat with Jonz as a page, on a phone or a tablet (from WIDE the same
 * chat opens as a panel beside the page instead: AskPanel). For a new house
 * it's Describe your house, pushed from Today's setup card and the empty
 * John list: Jonz (Claude, or a starter list when Claude isn't there)
 * drafts the Johns. For a house with a list it's Ask Jonz, from the
 * sparkles in the title bar: Jonz changes the list (a House Pass extra).
 * Either way an admin applies what they want. Not a HousePage: the chat
 * scrolls over a message box that stays put above the keyboard.
 */
export default function DescribeScreen() {
  const { session, house } = useMembership();
  // The layout's guard only shows the house's screens with a house and a session.
  return (
    <AskJonz
      houseId={house!.id}
      userId={session!.user.id}
      bar={({ title, lead, actions, back }) => (
        <>
          {/* Your chats goes back to the chat, which goes back to House. */}
          <TitleBar
            title={title}
            lead={lead}
            back={back ? undefined : '/house'}
            onBack={back?.onPress}
            backLabel={back?.label ?? SECTION_LABEL.house}
            right={actions}
          />
          <PageTitle page={title} />
        </>
      )}
    />
  );
}
