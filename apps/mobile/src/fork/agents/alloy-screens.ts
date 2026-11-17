import { createNativeStackScreen } from "@react-navigation/native-stack";

import { pageRoute, sheetRoute } from "../../features/layout/route-options";
import { AlloyAccountsScreen } from "./AlloyAccountsScreen";
import { AlloyCompanyScreen } from "./AlloyCompanyScreen";
import { AlloyCompScreen } from "./AlloyCompScreen";
import { AlloyCompsScreen } from "./AlloyCompsScreen";
import { AlloyEditGoalSheet, AlloyNewGoalSheet } from "./AlloyGoalFormSheet";
import { AlloyGoalScreen } from "./AlloyGoalScreen";
import { AlloyLessonsScreen } from "./AlloyLessonsScreen";
import { AlloyNewCompSheet } from "./AlloyNewCompSheet";

const FORM_SHEET = sheetRoute({ detent: "full", android: "card" });

export const ALLOY_SCREENS = {
  AlloyGoal: createNativeStackScreen({ screen: AlloyGoalScreen, options: pageRoute() }),
  AlloyNewGoal: createNativeStackScreen({ screen: AlloyNewGoalSheet, options: FORM_SHEET }),
  AlloyEditGoal: createNativeStackScreen({ screen: AlloyEditGoalSheet, options: FORM_SHEET }),
  AlloyCompany: createNativeStackScreen({ screen: AlloyCompanyScreen, options: pageRoute() }),
  AlloyComps: createNativeStackScreen({ screen: AlloyCompsScreen, options: pageRoute() }),
  AlloyNewComp: createNativeStackScreen({ screen: AlloyNewCompSheet, options: FORM_SHEET }),
  AlloyComp: createNativeStackScreen({ screen: AlloyCompScreen, options: pageRoute() }),
  AlloyAccounts: createNativeStackScreen({ screen: AlloyAccountsScreen, options: pageRoute() }),
  AlloyLessons: createNativeStackScreen({ screen: AlloyLessonsScreen, options: pageRoute() }),
};
