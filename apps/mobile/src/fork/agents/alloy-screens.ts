import { createNativeStackScreen } from "@react-navigation/native-stack";

import { pageRoute, sheetRoute } from "../../features/layout/route-options";
import { AlloyAccountsScreen } from "./AlloyAccountsScreen";
import { AlloyCompanyScreen } from "./AlloyCompanyScreen";
import { AlloyCompScreen } from "./AlloyCompScreen";
import { AlloyCompsScreen } from "./AlloyCompsScreen";
import { AlloyEditGoalSheet, AlloyNewGoalSheet } from "./AlloyGoalFormSheet";
import { AlloyGoalScreen } from "./AlloyGoalScreen";
import { AlloyLessonsScreen } from "./AlloyLessonsScreen";
import { AlloyNewAgentSheet } from "./AlloyNewAgentSheet";
import { AlloyNewCompSheet } from "./AlloyNewCompSheet";
import { AlloySettingsScreen } from "./AlloySettingsScreen";

const FORM_SHEET = sheetRoute({ detent: "full", android: "card" });
const SETTINGS_PAGE = pageRoute({ itemStyle: "standard" });

// Pages under Settings › Alloy are named Settings* so the Settings tab stays open beneath them.
export const ALLOY_SCREENS = {
  AlloyGoal: createNativeStackScreen({ screen: AlloyGoalScreen, options: pageRoute() }),
  AlloyNewAgent: createNativeStackScreen({ screen: AlloyNewAgentSheet, options: FORM_SHEET }),
  AlloyNewGoal: createNativeStackScreen({ screen: AlloyNewGoalSheet, options: FORM_SHEET }),
  AlloyEditGoal: createNativeStackScreen({ screen: AlloyEditGoalSheet, options: FORM_SHEET }),
  AlloyNewComp: createNativeStackScreen({ screen: AlloyNewCompSheet, options: FORM_SHEET }),
  SettingsAlloy: createNativeStackScreen({ screen: AlloySettingsScreen, options: SETTINGS_PAGE }),
  SettingsAlloyAccounts: createNativeStackScreen({
    screen: AlloyAccountsScreen,
    options: SETTINGS_PAGE,
  }),
  SettingsAlloyCompany: createNativeStackScreen({
    screen: AlloyCompanyScreen,
    options: SETTINGS_PAGE,
  }),
  SettingsAlloyComps: createNativeStackScreen({ screen: AlloyCompsScreen, options: SETTINGS_PAGE }),
  SettingsAlloyComp: createNativeStackScreen({ screen: AlloyCompScreen, options: SETTINGS_PAGE }),
  SettingsAlloyLessons: createNativeStackScreen({
    screen: AlloyLessonsScreen,
    options: SETTINGS_PAGE,
  }),
};
