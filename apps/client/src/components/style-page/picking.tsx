import { useState } from 'react';

import { Combobox } from '@/components/combobox';
import { Field } from '@/components/field';
import { GroupItem } from '@/components/group';
import { Row } from '@/components/row';
import { Select } from '@/components/select';

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
