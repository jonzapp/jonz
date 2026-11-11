import { getCalendars, getLocales } from 'expo-localization';

import { deviceCurrency, deviceLanguage, deviceTimeZone } from './locale';

jest.mock('expo-localization', () => ({ getCalendars: jest.fn(), getLocales: jest.fn() }));

const calendars = getCalendars as jest.Mock;
const locales = getLocales as jest.Mock;

describe('a new house starts from the phone', () => {
  it("takes the phone's time zone, or London when it won't say", () => {
    calendars.mockReturnValueOnce([{ timeZone: 'America/Toronto' }]);
    expect(deviceTimeZone()).toBe('America/Toronto');
    calendars.mockReturnValueOnce([{ timeZone: null }]);
    expect(deviceTimeZone()).toBe('Europe/London');
    calendars.mockReturnValueOnce([]);
    expect(deviceTimeZone()).toBe('Europe/London');
  });

  it("takes the region's currency, pounds anywhere else", () => {
    locales.mockReturnValueOnce([{ regionCode: 'CA' }]);
    expect(deviceCurrency()).toBe('CAD');
    locales.mockReturnValueOnce([{ regionCode: 'DE' }]);
    expect(deviceCurrency()).toBe('EUR');
    locales.mockReturnValueOnce([{ regionCode: null }]);
    expect(deviceCurrency()).toBe('GBP');
    locales.mockReturnValueOnce([]);
    expect(deviceCurrency()).toBe('GBP');
  });
});

describe("the phone's language", () => {
  it('reads as one Jonz has, English where it has not got it', () => {
    locales.mockReturnValueOnce([{ languageTag: 'en-CA' }]);
    expect(deviceLanguage()).toBe('en');
    locales.mockReturnValueOnce([{ languageTag: 'fr-FR' }]);
    expect(deviceLanguage()).toBe('en');
    locales.mockReturnValueOnce([]);
    expect(deviceLanguage()).toBe('en');
    locales.mockImplementationOnce(() => {
      throw new Error('no locales');
    });
    expect(deviceLanguage()).toBe('en');
  });

  it("never takes the test language from a phone set to Android's", () => {
    locales.mockReturnValueOnce([{ languageTag: 'en-XA' }]);
    expect(deviceLanguage()).toBe('en');
  });
});
