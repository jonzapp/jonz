import { Redirect } from 'expo-router';

/** History is gone: each move's Undo is in the sheet its Wall post opens. An old link lands on the Wall. */
export default function HistoryScreen() {
  return <Redirect href="/house/wall" />;
}
