import { useNavigation } from "@react-navigation/native";

import { openSettings } from "../../features/settings/settings-navigation";

/** The Settings list's row for Settings › Alloy. */
export function useAlloySettingsRow() {
  const navigation = useNavigation();
  return {
    id: "SettingsAlloy",
    icon: "cube",
    label: "Alloy",
    onPress: () => openSettings(navigation, "SettingsAlloy"),
  } as const;
}
