import { useLocalSearchParams } from 'expo-router';

import { STYLE_PAGE } from '@/components/style-page/enabled';
import { ReplyGallery } from '@/components/style-page/replies';

import NotFound from '../+not-found';

/**
 * /style/replies: Ask Jonz's sample replies (packages/core reply-samples.ts)
 * as the chat draws them, in Day or Night as the device is; ?only=<id> for
 * one. Hidden like /style: production shows the not-found page.
 */
export default function StyleReplies() {
  const { only } = useLocalSearchParams<{ only?: string }>();
  return STYLE_PAGE ? <ReplyGallery only={only} /> : <NotFound />;
}
