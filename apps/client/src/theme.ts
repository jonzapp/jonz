import { BIN_NIGHT, type BinNightScheme, type Look } from '@app/core';
import { createContext, useContext } from 'react';
import { useColorScheme, type TextStyle } from 'react-native';

// Bin Night for React Native: the one theme file. Colours come from @app/core;
// this file only turns them into React Native styles. Never hardcode a colour
// anywhere else in the app.

/**
 * Overpass in the weights the web uses. On iOS and Android each weight is its
 * own font family, so text names the family; `fontWeight` alone would fall
 * back to the system font.
 */
export const FONT = {
  regular: 'Overpass_400Regular',
  bold: 'Overpass_700Bold',
  extrabold: 'Overpass_800ExtraBold',
  black: 'Overpass_900Black',
} as const;

/**
 * The font files, keyed by family, for `useFonts`: the app's own copies of
 * the four weights (assets/fonts), whose middle dot keeps its width so " · "
 * has a space on both sides; the README there says what changed.
 */
export const FONT_FILES = {
  [FONT.regular]: require('../assets/fonts/Overpass_400Regular.ttf'),
  [FONT.bold]: require('../assets/fonts/Overpass_700Bold.ttf'),
  [FONT.extrabold]: require('../assets/fonts/Overpass_800ExtraBold.ttf'),
  [FONT.black]: require('../assets/fonts/Overpass_900Black.ttf'),
};

/** Spacing in points, on the web's 4px grid. */
export const SPACE = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

/** The smallest a control may be: the web's `min-h-12`, a thumb's width. */
export const TAP = 48;

export const RADIUS = BIN_NIGHT.radius;

/** An icon beside a control's words (a button's tick, a link's chevron). */
export const ICON = 20;

/** The glyph in an icon-only control (close, •••, the sparkles): one size everywhere, in a TAP square. */
export const ICON_ONLY = 22;

/**
 * The narrowest a button in a ButtonRow may be before the row stacks: about
 * "Mark fixed" with its icon. Below it, the buttons go full width, one under
 * another, rather than cut or squeeze their words.
 */
export const BUTTON_MIN = 136;

/** A form's column on a laptop: sign-in, a report, a setting's editor. */
export const FORM_MAX = 520;

/** Width from which the web layout spreads out (Tailwind's `lg`): the rail instead of the tabs. */
export const WIDE = 1024;

/** Below this window width (a small phone) a few controls tighten so their words aren't cut short. */
export const NARROW = 360;

/** The rail's width down the window's left, from WIDE. */
export const RAIL = 232;

// Focus's layout, in points. A group or card starts GUTTER in from the page's
// edge and its content INSET further in, so everything readable lines up on
// one leading edge (32 on a phone): titles, section labels, rows' leading
// slots, card content.

/** From the page's edge to a group or a card. */
export const GUTTER = 16;
/** From a group's or card's edge to what's in it. */
export const INSET = 16;
/** The title bar's height, under the top safe area. */
export const TITLE_BAR = 52;
/** The shortest row: one line. A row with a meta line comes out at about 64. */
export const ROW_MIN = 56;
/** A row's leading slot: a tick box, an avatar or an icon. */
export const LEADING = 32;
/** From the leading slot to the row's words, and between a row's other parts. */
export const ROW_GAP = 12;
/** An inset group's corners, and the one card's. */
export const GROUP_RADIUS = 10;
/** The widest a screen's content gets, on every tab. */
export const CONTENT_MAX = 680;
/**
 * The widest the main column of a page in two columns gets (Today, Week,
 * House on a laptop): it grows with the window up to this, and past it the
 * room falls between it and the side panel.
 */
export const MAIN_MAX = 1040;
/** The side panel of a page in two columns: its content, inside a GUTTER each side. */
export const ASIDE = 380;
/** The page's own width from which a page that spreads goes to two columns. */
export const COLUMNS_MIN = 1000;
/** House's list of its pages down the left of its pages on a laptop. */
export const HOUSE_NAV = 240;
/** The House tab's width from which its pages are listed beside them: room for the list and a phone's column. */
export const WORKSPACE_MIN = 960;
/** A panel down the right of House's pages on a laptop (a John's details), as wide as the chat with Jonz. */
export const PANEL = 400;
/**
 * The widest a House page's content runs on a laptop when it fills the room
 * beside House's list (`Screen` with `fills`): its sections side by side in
 * columns (`Pair`, `Flow`). Past it the room is left at the right.
 */
export const FILL_MAX = 1600;
/** The narrowest column a filled page's sections go into: two on a 1440 laptop, three on a 1920 screen. */
export const COLUMN_MIN = 360;
/** The narrowest a figure gets in a row of `Figures` before the row goes two to a line, as on a phone. */
export const FIGURE_MIN = 180;
/** Between one section and the next. */
export const SECTION_GAP = 32;
/** From a section's label to its group. */
export const LABEL_GAP = 8;

/** Figures that line up in columns: Focus sets every number this way. */
export const TABULAR: TextStyle = { fontVariant: ['tabular-nums'] };

export type SchemeName = 'light' | 'dark';

export interface Theme {
  scheme: SchemeName;
  colors: BinNightScheme;
  type: {
    // Focus's six roles (and the tab label and initials). A screen uses these and never
    // sets a size of its own. Copy is written in sentence case; the caps
    // come from the role.

    /** 28/32 Black caps: once per screen, in the title bar. */
    title: TextStyle;
    /** 22/28 Bold, sentence case: at most once per screen (the next John, "You're up £4.01"). */
    lead: TextStyle;
    /** 15/20 ExtraBold, sentence case: a section's name, three words at most, said as a heading rather than a tag. */
    sectionLabel: TextStyle;
    /** 17 Bold: a row's title, a button's label. */
    rowTitle: TextStyle;
    /** 16/24 Regular: sentences, and a row's trailing value. */
    body: TextStyle;
    /** 14/20 Regular, muted: every subtitle and secondary line. */
    meta: TextStyle;
    /** 12 Bold, sentence case: the tab bar's labels. Colour by state, so none here. */
    tabLabel: TextStyle;
    /** 12/16 ExtraBold caps, a little tracked: an avatar's initials and a count badge's figure. The plate colours it. */
    initials: TextStyle;
    /**
     * 12/16 ExtraBold caps, tracked, muted: the small print of a grid, a
     * calendar's weekdays and a table's column heads. Chips use it in ink or
     * hazard. Never a section's name.
     */
    caps: TextStyle;
    /**
     * 24/26 Black caps: the words on a street-name plate (StreetPlate), the
     * link cards' sign brought indoors. Today's next John, and nothing else.
     */
    plate: TextStyle;

    // Bin Night's older roles, kept for the brand screens (the front door,
    // sign-in, joining) and the pages for a missing link or a screen that
    // failed to draw.

    /** Uppercase Overpass, council-sign heavy. `level` 1 is the page title. */
    heading: (level: 1 | 2 | 3) => TextStyle;
    /** The quieter grey, for running text (the same as `meta`). */
    muted: TextStyle;
  };
}

const HEADING_SIZE = { 1: 40, 2: 24, 3: 18 } as const;

/** The theme for a colour scheme. Anything but "dark" is daylight. */
export function themeFor(scheme: string | null | undefined): Theme {
  const name: SchemeName = scheme === 'dark' ? 'dark' : 'light';
  const colors = BIN_NIGHT[name];
  return {
    scheme: name,
    colors,
    type: {
      title: {
        fontFamily: FONT.black,
        fontSize: 28,
        lineHeight: 32,
        letterSpacing: 0.5,
        textTransform: 'uppercase',
        color: colors.foreground,
        ...TABULAR,
      },
      lead: { fontFamily: FONT.bold, fontSize: 22, lineHeight: 28, color: colors.foreground, ...TABULAR },
      sectionLabel: { fontFamily: FONT.extrabold, fontSize: 15, lineHeight: 20, color: colors.foreground, ...TABULAR },
      rowTitle: { fontFamily: FONT.bold, fontSize: 17, lineHeight: 22, color: colors.foreground, ...TABULAR },
      body: { fontFamily: FONT.regular, fontSize: 16, lineHeight: 24, color: colors.foreground, ...TABULAR },
      meta: { fontFamily: FONT.regular, fontSize: 14, lineHeight: 20, color: colors.mutedForeground, ...TABULAR },
      tabLabel: { fontFamily: FONT.bold, fontSize: 12, lineHeight: 16, ...TABULAR },
      initials: {
        fontFamily: FONT.extrabold,
        fontSize: 12,
        lineHeight: 16,
        letterSpacing: 0.5,
        textTransform: 'uppercase',
        ...TABULAR,
      },
      caps: {
        fontFamily: FONT.extrabold,
        fontSize: 12,
        lineHeight: 16,
        letterSpacing: 1,
        textTransform: 'uppercase',
        color: colors.mutedForeground,
        ...TABULAR,
      },
      plate: {
        fontFamily: FONT.black,
        fontSize: 24,
        lineHeight: 26,
        letterSpacing: 0.5,
        textTransform: 'uppercase',
        color: colors.foreground,
        ...TABULAR,
      },
      heading: (level) => ({
        fontFamily: level === 1 ? FONT.black : FONT.extrabold,
        fontSize: HEADING_SIZE[level],
        lineHeight: Math.round(HEADING_SIZE[level] * (level === 1 ? 0.95 : 1.15)),
        letterSpacing: level === 1 ? -0.5 : 0,
        textTransform: 'uppercase',
        color: colors.foreground,
      }),
      muted: { fontFamily: FONT.regular, fontSize: 14, lineHeight: 20, color: colors.mutedForeground },
    },
  };
}

/**
 * The look this device chose: day, night, or the system's (the default, as
 * on the web). LookProvider (hooks/look.tsx) holds it; without one, the
 * system decides.
 */
export const LookContext = createContext<Look>('system');

/** The theme for the look this device chose, the system's colour scheme by default. */
export function useTheme(): Theme {
  const system = useColorScheme();
  const look = useContext(LookContext);
  return themeFor(look === 'system' ? system : look);
}
