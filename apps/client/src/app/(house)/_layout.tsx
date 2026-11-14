import { memberCan } from "@app/core";
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
import { useKeepMyZone } from "@/hooks/use-keep-my-zone";
import { useMembership } from "@/hooks/use-membership";
import { RAIL, SPACE, useTheme, WIDE } from "@/theme";
import { useWords } from '@/hooks/use-words';

/** The tab bar's height above the home bar, so a toast clears it. */
const TAB_BAR = 56;

/**
 * A house's four places, Today, Week, House and You, as tabs along the bottom of
 * a phone and a rail from laptop width on the web. House and You are stacks of
 * their own (house/_layout, you/_layout), so the pages they push keep the tabs. Each screen
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
  const words = useWords();
  // The root layout's guard only opens this group with a house and a session.
  const { session, house } = useMembership();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const wide = useWindowDimensions().width >= WIDE;
  const { view } = useHouse(house!.id, session!.user.id);
  useLiveHouse(house!.id);
  useKeepMyZone(session!.user.id);

  const shell: ShellHouse = {
    name: view?.snapshot.house.name ?? house!.name,
    memberCount: view?.snapshot.members.length ?? 1,
    family: view?.snapshot.house.kind === "family",
  };
  // The Today tab's badge: votes waiting for you, or in a family, kids' ticks waiting for your OK.
  const toVote = (view?.today.toVote.length ?? 0) + (view?.today.toOk.length ?? 0);
  // What a tour's steps depend on, as the tour starts.
  const admin = memberCan(view?.me, "house:write");
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
              <TourProvider facts={facts} canAsk={memberCan(view?.me, "house:read")}>
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
                      options={{ title: words('common.section.today') }}
                    />
                    <Tabs.Screen
                      name="week"
                      options={{ title: words('common.section.week') }}
                    />
                    <Tabs.Screen
                      name="house"
                      options={{ title: words('common.section.house') }}
                    />
                    <Tabs.Screen
                      name="you"
                      options={{ title: words('common.section.you') }}
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
