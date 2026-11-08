import {
  PASS_COPY,
  PASS_PURCHASES,
  personStage,
  promotionPersonMeta,
  promotionPrice,
  promotionSentence,
  promotionTitle,
  promotionWhoSentence,
  PROMOTIONS_COPY,
  planPrice,
  type PromotionAudience,
  type PromotionPerson,
  type PromotionTerms,
} from '@app/core';
import { CheckIcon, CopyIcon, Share2Icon, TicketIcon } from 'lucide-react-native';
import { useState } from 'react';
import { Platform, Share, StyleSheet, View } from 'react-native';

import { Button } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { Card } from '@/components/card';
import { Row, RowIcon } from '@/components/row';
import { Section } from '@/components/section';
import { Chip } from '@/components/status-mark';
import { Body, Lead, Meta } from '@/components/text';
import { SITE_URL } from '@/links';
import { INSET, SPACE } from '@/theme';

const ZONE = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** A promotion's link, on this site. */
export const promotionLink = (code: string) => `${SITE_URL}/offer/${encodeURIComponent(code)}`;

/**
 * What the people it's for get, before it's made or on its page: the
 * headline and sentence they read, what each plan costs with it, and who
 * can use it. Prices are in dollars here; each house sees its own currency.
 */
export function PromotionPreview({
  terms,
  note,
  audience,
  emails,
  maxUses,
  titled = true,
}: {
  terms: PromotionTerms;
  note: string | null;
  audience: PromotionAudience;
  emails: readonly string[];
  maxUses: number | null;
  /** False in a sheet whose own title already says What they get. */
  titled?: boolean;
}) {
  const zone = ZONE();
  const gift = terms.kind === 'gift';
  const card = (
    <Card>
      <View style={styles.words}>
        <Meta>{PROMOTIONS_COPY.giftFrom}</Meta>
        <Lead testID="promotion-preview-title">{promotionTitle(terms)}</Lead>
        {note ? <Body>{note}</Body> : null}
        <Body muted testID="promotion-preview-sentence">
          {promotionSentence(terms, zone)}
        </Body>
      </View>
    </Card>
  );
  return (
    <View style={styles.preview} testID="promotion-preview">
      {titled ? (
        <Section label={PROMOTIONS_COPY.whatTheyGet} bare>
          {card}
        </Section>
      ) : (
        card
      )}
      {gift ? null : (
        <Section label={PROMOTIONS_COPY.whatTheyPay} testID="promotion-preview-prices">
          {terms.plans.length === 0 ? (
            <Row title={PROMOTIONS_COPY.noPlans} />
          ) : (
            PASS_PURCHASES.map((plan) => {
              const price = promotionPrice(terms, plan, 'USD');
              const label = plan === 'yearly' ? PASS_COPY.yearly : plan === 'monthly' ? PASS_COPY.monthly : PASS_COPY.foundingPlan;
              return price ? (
                <Row key={plan} title={price.label} meta={price.then ?? undefined} trailing={price.first} testID={`promotion-price-${plan}`} />
              ) : (
                <Row key={plan} title={label} meta={PROMOTIONS_COPY.notIn} trailing={planPrice(plan)} testID={`promotion-price-${plan}`} />
              );
            })
          )}
        </Section>
      )}
      <Section label={PROMOTIONS_COPY.whoTitle} bare>
        <Meta testID="promotion-preview-who">{promotionWhoSentence(audience, emails, maxUses, terms.endsAt, zone)}</Meta>
      </Section>
    </View>
  );
}

/** What the web build can do with a link: the browser's clipboard and share sheet, where it has them. */
interface WebNavigator {
  clipboard?: { writeText: (text: string) => Promise<void> };
  share?: unknown;
}

function webNavigator(): WebNavigator | undefined {
  if (Platform.OS !== 'web') return undefined;
  return (globalThis as { navigator?: WebNavigator }).navigator;
}

/**
 * The promotion's one link, to copy or share, as an invite link is: on a
 * phone the share sheet (which has a Copy of its own), on the web Copy link
 * and, where the browser has a share sheet, Share.
 */
export function PromotionLink({ code, title }: { code: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const url = promotionLink(code);
  const web = webNavigator();
  const canShare = !web || typeof web.share === 'function';

  async function share() {
    try {
      await Share.share({ title, message: url, url });
    } catch {
      // Cancelled: the link is on screen.
    }
  }

  async function copy() {
    try {
      await web?.clipboard?.writeText(url);
      setCopied(true);
    } catch {
      // Not allowed: the link is on screen to select.
    }
  }

  return (
    <Section label={PROMOTIONS_COPY.link} testID="promotion-link">
      <Row leading={<RowIcon icon={TicketIcon} />} title={url.replace(/^https:\/\//, '')} meta={PROMOTIONS_COPY.linkMeta} testID="promotion-url" />
      <View style={styles.inset}>
        <ButtonRow>
          {web?.clipboard ? (
            <Button
              label={copied ? PROMOTIONS_COPY.copied : PROMOTIONS_COPY.copy}
              icon={copied ? CheckIcon : CopyIcon}
              onPress={() => void copy()}
              testID="promotion-copy"
            />
          ) : null}
          {canShare ? (
            <Button
              label={PROMOTIONS_COPY.share}
              icon={Share2Icon}
              variant={web?.clipboard ? 'outline' : 'primary'}
              onPress={() => void share()}
              testID="promotion-share"
            />
          ) : null}
        </ButtonRow>
      </View>
    </Section>
  );
}

/** The people a named promotion is for, each with where they've got to. */
export function PromotionPeople({ people }: { people: readonly PromotionPerson[] }) {
  const zone = ZONE();
  return (
    <Section label={PROMOTIONS_COPY.peopleTitle} count={people.length} testID="promotion-people">
      {people.map((p) => {
        const stage = personStage(p);
        return (
          <Row
            key={p.email}
            title={p.email}
            meta={promotionPersonMeta(p, zone)}
            trailing={<Chip label={PROMOTIONS_COPY.stage[stage]} tone={stage === 'used' ? 'good' : 'quiet'} icon={stage === 'used' ? CheckIcon : undefined} />}
            testID={`promotion-person-${p.email}`}
          />
        );
      })}
    </Section>
  );
}

const styles = StyleSheet.create({
  preview: { gap: SPACE.xl },
  words: { gap: SPACE.sm },
  inset: { paddingHorizontal: INSET, paddingBottom: INSET },
});
