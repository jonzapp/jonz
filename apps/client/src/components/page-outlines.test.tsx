import { render, screen } from '@testing-library/react-native';

import {
  ArticleOutline,
  DoorOutline,
  HouseOutline,
  ListPageOutline,
  PersonOutline,
  RecordOutline,
  SettingsOutline,
  StakeOutline,
  TodayOutline,
  WallOutline,
  WeekOutline,
} from './page-outlines';

// The bars are hidden from a screen reader (Waiting says what's reading), so look among hidden elements.
const hidden = { includeHiddenElements: true };

describe("each page's outline", () => {
  it.each([
    ['Today', <TodayOutline key="t" />, 3 + 2 + 3],
    ['Week', <WeekOutline key="w" />, 4 + 3 + 4],
    ['House', <HouseOutline key="h" />, 4 + 4 + 3],
    ['a housemate', <PersonOutline key="p" />, 1 + 3 + 3],
    ['the Stake', <StakeOutline key="s" />, 3 + 2],
    ['the Wall', <WallOutline key="wa" />, 6],
    ['a track record', <RecordOutline key="r" />, 4],
    ['the John list', <ListPageOutline key="l" />, 5 + 3],
    ['the rules', <SettingsOutline key="ru" sections={[4, 3, 2]} />, 4 + 3 + 2],
  ])('draws %s as rows in groups, each row with its hairline', async (_, outline, rows) => {
    await render(outline);
    expect(screen.getAllByTestId('hairline', hidden)).toHaveLength(rows);
  });

  it('draws a page of reading and a link at the front door with no rows', async () => {
    await render(
      <>
        <ArticleOutline />
        <DoorOutline />
      </>,
    );
    expect(screen.queryAllByTestId('hairline', hidden)).toHaveLength(1);
  });
});
