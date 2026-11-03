import { SECTION_LABEL } from "@app/core";
import { Tabs } from "expo-router/js-tabs";
import { useMemo } from "react";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AskPanel } from "@/components/house/ask-panel";
import { JohnSheetProvider } from "@/components/john-sheet";
import { SheetRailContext } from "@/components/sheet";
import { HouseTabBar, type ShellHouse } from "@/components/shell/house-tab-bar";
import { ToastProvider } from "@/components/toast";
import { TourProvider } from "@/components/tour/tour-provider";
import { AskPanelProvider } from "@/hooks/use-ask-jonz";
import { PhotosContext } from "@/hooks/photos";
import { useHouse, useLiveHouse } from "@/hooks/use-house";
import { useMembership } from "@/hooks/use-membership";
import { RAIL, SPACE, useTheme, WIDE } from "@/theme";

/** The tab bar's height above the home bar, so a toast clears it. */
const TAB_BAR = 56;

/**
 * A house's three places, Today, Week and House, as tabs along the bottom of
 * a phone and a rail from laptop width on the web. House is a stack of its
 * own (house/_layout), so the pages it pushes keep the tabs. Each screen
 * draws its own title bar. The house is followed live here, once for every
 * tab, and the John sheet, the toasts and everyone's photos are mounted
 * here for all of them.
 * From WIDE every sheet centres itself on the page beside the rail, and the
 * chat with Jonz opens as a panel down the right (AskPanel) with the page
 * still beside it.
 * The tours and the Help sheet (TourProvider) are mounted here too, round
 * every tab, as a tour can walk from one page to another.
 */
export default function HouseLayout() {
  // The root layout's guard only opens this group with a house and a session.
  const { session, house } = useMembership();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const wide = useWindowDimensions().width >= WIDE;
  const { view } = useHouse(house!.id, session!.user.id);
  useLiveHouse(house!.id);

  const shell: ShellHouse = {
    name: view?.snapshot.house.name ?? house!.name,
    memberCount: view?.snapshot.members.length ?? 1,
  };
  const toVote = view?.today.toVote.length ?? 0;
  // What a tour's steps depend on, as the tour starts.
  const admin = view?.me?.role === "admin";
  const toCheck = toVote + (view?.today.toCover.length ?? 0) > 0;
  const hasJohns = (view?.today.mine.length ?? 0) > 0;
  const facts = useMemo(
    () => ({ admin, wide, toCheck, hasJohns }),
    [admin, wide, toCheck, hasJohns],
  );
  const members = view?.snapshot.members;
  const photos = useMemo(
    () =>
      new Map(
        (members ?? []).flatMap((m) =>
          m.photo ? [[m.userId, m.photo] as const] : [],
        ),
      ),
    [members],
  );

  return (
    <PhotosContext.Provider value={photos}>
      <SheetRailContext.Provider value={wide ? RAIL : 0}>
        <ToastProvider
          bottom={wide ? SPACE.xl : TAB_BAR + insets.bottom + SPACE.lg}
        >
          <JohnSheetProvider houseId={house!.id} userId={session!.user.id}>
            <AskPanelProvider>
              <TourProvider facts={facts}>
              <View style={styles.row}>
                <View style={styles.page}>
                  <Tabs
                    tabBar={(props) => (
                      <HouseTabBar
                        {...props}
                        wide={wide}
                        house={view ? shell : null}
                        toVote={toVote}
                      />
                    )}
                    screenOptions={{
                      tabBarPosition: wide ? "left" : "bottom",
                      headerShown: false,
                      sceneStyle: { backgroundColor: colors.background },
                    }}
                  >
                    <Tabs.Screen
                      name="today"
                      options={{ title: SECTION_LABEL.today }}
                    />
                    <Tabs.Screen
                      name="week"
                      options={{ title: SECTION_LABEL.week }}
                    />
                    <Tabs.Screen
                      name="house"
                      options={{ title: SECTION_LABEL.house }}
                    />
                  </Tabs>
                </View>
                <AskPanel houseId={house!.id} userId={session!.user.id} />
              </View>
              </TourProvider>
            </AskPanelProvider>
          </JohnSheetProvider>
        </ToastProvider>
      </SheetRailContext.Provider>
    </PhotosContext.Provider>
  );
}

const styles = StyleSheet.create({
  row: { flex: 1, flexDirection: "row" },
  page: { flex: 1 },
});
