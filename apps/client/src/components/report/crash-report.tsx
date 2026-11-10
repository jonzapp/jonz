import { MessageSquareWarningIcon } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { noteError } from '@/api/report-details';
import { supabase } from '@/api/supabase';
import { Button } from '@/components/button';
import { ButtonRow } from '@/components/button-row';
import { ReportForm } from '@/components/report/report-form';
import { Sheet } from '@/components/sheet';
import { Meta } from '@/components/text';
import { SPACE } from '@/theme';
import { useWords } from '@/hooks/use-words';

/**
 * "Tell us what happened", on the screen that says something broke
 * (docs/specs/report-a-problem.md, step 3): the report sheet, opened on a
 * problem, with what broke as its last error so it's in the details they
 * see before they send. This screen stands in for the whole app, so it
 * reads the session itself; signed out, it gives the support address.
 */
export function CrashReport({ error }: { error: Error }) {
  const words = useWords();
  const [signedIn, setSignedIn] = useState(false);
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState(false);
  useEffect(() => {
    let live = true;
    void supabase.auth
      .getSession()
      .then(({ data }) => {
        if (live) setSignedIn(data.session !== null);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  if (sent) return <Meta testID="crash-report-sent">{words('door.error.told')}</Meta>;
  if (!signedIn) return <Meta>{words('door.error.orEmail')}</Meta>;
  return (
    <View style={styles.stack}>
      <ButtonRow>
        <Button
          label={words('door.error.tell')}
          icon={MessageSquareWarningIcon}
          variant="outline"
          onPress={() => {
            noteError(error.message || error.name || 'The screen stopped drawing');
            setOpen(true);
          }}
          testID="crash-report"
        />
      </ButtonRow>
      <Sheet visible={open} title={words('door.error.tellTitle')} onClose={() => setOpen(false)} testID="crash-report-sheet">
        {open ? (
          <ReportForm
            start="problem"
            house={null}
            onSent={() => {
              setOpen(false);
              setSent(true);
            }}
          />
        ) : null}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: SPACE.sm },
});
