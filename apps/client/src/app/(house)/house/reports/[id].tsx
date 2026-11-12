import { Redirect, useLocalSearchParams } from 'expo-router';

/** A report is under You now: an old link (in an email already sent, say) lands there. */
export default function OldReportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={`/you/reports/${id}` as never} />;
}
