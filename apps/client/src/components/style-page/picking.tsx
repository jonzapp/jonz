import { useState } from 'react';

import { Combobox } from '@/components/combobox';
import { CommandCard } from '@/components/command-box';
import { Field } from '@/components/field';
import { GroupItem } from '@/components/group';
import { Row } from '@/components/row';
import { Select } from '@/components/select';
import { commandGroups, type CommandHouse } from '@/components/shell/command-hits';
import { useWords } from '@/hooks/use-words';

import { SAMPLE_HOUSE } from './replies';

const DAYS = [
  { value: 1, label: 'Monday' },
  { value: 6, label: 'Saturday' },
  { value: 7, label: 'Sunday' },
];
const SPANS = [
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'November' },
] as const;
const CITIES = ['London, United Kingdom', 'Regina, Canada', 'Toronto, Canada', 'Paris, France'];
const none = () => {};

/** The sample house as the command box searches it. */
const COMMAND_HOUSE: CommandHouse = {
  userId: SAMPLE_HOUSE.viewerId,
  family: false,
  kid: false,
  people: SAMPLE_HOUSE.people,
  johns: SAMPLE_HOUSE.johns,
  kinds: SAMPLE_HOUSE.kinds ?? [],
};

/** Picking one from a list (a Select, and a small one at a row's end), typing to search a long one (a Combobox), and a password's Show. */
export function Picking() {
  const [day, setDay] = useState(1);
  const [span, setSpan] = useState<'week' | 'month'>('week');
  const [city, setCity] = useState(CITIES[0]);
  const [query, setQuery] = useState('');
  const found = CITIES.filter((c) => c.toLowerCase().includes(query.trim().toLowerCase()));
  return (
    <>
      <GroupItem>
        <Select label="Weeks start" options={DAYS} value={day} onChange={setDay} hint="Johns are dealt on this day" testID="style-select" />
        <Combobox
          label="Time zone"
          shown={city}
          hint="GMT+0, 12:00 there now"
          search={{ value: query, onChange: setQuery, placeholder: 'Search a city or country' }}
          testID="style-combobox"
        >
          {(close) =>
            found.map((c) => (
              <Row
                key={c}
                title={c}
                selected={c === city}
                onPress={() => {
                  setCity(c);
                  close();
                }}
              />
            ))
          }
        </Combobox>
        <Field label="Password" defaultValue="bins-on-thursday" secureTextEntry testID="style-password" />
      </GroupItem>
      <Row title="The Table" trailing={<Select small label="Show" options={SPANS} value={span} onChange={setSpan} testID="style-select-small" />} />
    </>
  );
}

/** The command box's card as Ctrl K opens it, "t" typed, finding a John, a housemate and pages in the sample house. */
export function Finding() {
  const words = useWords();
  const [query, setQuery] = useState('t');
  return (
    <GroupItem>
      <CommandCard
        query={query}
        onQuery={setQuery}
        groups={commandGroups({ query, house: COMMAND_HOUSE, to: { href: none, john: none } }, words)}
        placeholder={words('common.command.placeholder')}
        none={words('common.command.none', { query: query.trim() })}
        onClose={() => setQuery('')}
        autoFocus={false}
      />
    </GroupItem>
  );
}
