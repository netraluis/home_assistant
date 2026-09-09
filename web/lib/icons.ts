import {
  BulbIcon,
  DashboardSpeed01Icon,
  PowerSocket01Icon,
} from "@hugeicons/core-free-icons";
import type { SensorType } from "@home/shared";

// El backend manda un emoji en `sensor.icon`; en la UI usamos Hugeicons, que
// es la librería que declara `components.json`. El emoji se ignora a propósito.
export const SENSOR_ICON: Record<SensorType, typeof BulbIcon> = {
  light: BulbIcon,
  toggle: PowerSocket01Icon,
  slider: DashboardSpeed01Icon,
};
