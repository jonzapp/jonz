import { PROMOTIONS_COPY } from '@app/core';
import { Redirect } from 'expo-router';

import { PromotionForm } from '@/components/admin/promotion-form';
import { useOwnerMay } from '@/components/admin/use-owner-may';
import { Screen, useColumns } from '@/components/screen';
import { TitleBar } from '@/components/title-bar';

/**
 * A new promotion as a page of its own, on a phone: pushed from Promotions'
 * New promotion; making it opens its page. A laptop fills it in in
 * Promotions' side panel, so this lands there, as it does for someone whose
 * app role can't make one.
 */
export default function NewPromotionPage() {
  return (
    <Screen spreads bar={<TitleBar title={PROMOTIONS_COPY.newPromotion} back={'/admin/promotions' as never} backLabel={PROMOTIONS_COPY.page} />} testID="admin-promotion-new">
      <NewPromotion />
    </Screen>
  );
}

function NewPromotion() {
  // The same test Promotions makes: in two columns the form is in its panel.
  const two = useColumns();
  const may = useOwnerMay('promotions:write');
  if (two || !may) return <Redirect href={'/admin/promotions' as never} />;
  return <PromotionForm />;
}
