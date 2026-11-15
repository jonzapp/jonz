import { SearchIcon } from 'lucide-react-native';

import { InputGroup } from '@/components/input-group';
import { useTheme } from '@/theme';

/**
 * A box that narrows a list already on the page as you type (the time zone
 * picker's): an InputGroup with the magnifier at its start. It looks like an
 * admin list's search (SmartSearch), with the focus ring while you're in it,
 * but has no filters and nothing to wait for. Its placeholder is its spoken
 * name.
 */
export function SearchBox({
  value,
  onChange,
  placeholder,
  testID = 'search-box',
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <InputGroup
      start={<SearchIcon size={20} color={colors.mutedForeground} aria-hidden />}
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      accessibilityLabel={placeholder}
      autoCapitalize="none"
      autoCorrect={false}
      returnKeyType="search"
      enterKeyHint="search"
      boxTestID={testID}
      testID={`${testID}-input`}
    />
  );
}
