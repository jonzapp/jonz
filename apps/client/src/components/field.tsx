import { EyeIcon, EyeOffIcon } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View, type TextInputProps } from 'react-native';

import { Alert } from '@/components/alert';
import { InputButton, InputGroup } from '@/components/input-group';
import { Body, Meta } from '@/components/text';
import { useWords } from '@/hooks/use-words';
import { FONT, SPACE } from '@/theme';

/** A form control's label: Body Bold, sentence case. Field, Choice and a Segmented in a form use it. */
export function FieldLabel({ children }: { children: string }) {
  return <Body style={styles.label}>{children}</Body>;
}

/**
 * A labelled text box at least a thumb tall (a multiline one, a few lines
 * tall): the label in Body Bold and sentence case, the box (an InputGroup)
 * on the card colour, then a hint in Meta or a problem to fix (an Alert:
 * ink, a triangle, never hazard). While you type in it, it wears the focus
 * ring. A password's box has Show at its end, which shows what's typed
 * until it's pressed again. With a `testID`, the box is `<testID>-box`.
 */
export function Field({
  label,
  hint,
  problem,
  ...input
}: { label: string; hint?: string; problem?: string } & Omit<TextInputProps, 'style'>) {
  const words = useWords();
  const [shown, setShown] = useState(false);
  const secret = input.secureTextEntry === true;
  return (
    <View style={styles.field}>
      <FieldLabel>{label}</FieldLabel>
      <InputGroup
        accessibilityLabel={label}
        {...input}
        secureTextEntry={secret && !shown}
        problem={problem != null}
        boxTestID={input.testID ? `${input.testID}-box` : undefined}
        end={
          secret ? (
            <InputButton
              icon={shown ? EyeOffIcon : EyeIcon}
              spoken={words(shown ? 'common.password.hide' : 'common.password.show')}
              onPress={() => setShown((was) => !was)}
              testID={input.testID ? `${input.testID}-show` : undefined}
            />
          ) : undefined
        }
      />
      {problem ? <Alert message={problem} /> : hint ? <Meta>{hint}</Meta> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: SPACE.sm },
  label: { fontFamily: FONT.bold },
});
