import { setupConfigHacks } from "./core/config-hacks";
import { Toolbar } from "./ui/toolbar";
import { FeatureRegistry, defaultFeatureDescriptors } from "./registry";
import "./core/trusted-types";

setupConfigHacks();

(async () => {
  if (!/youtube\.com/.test(window.location.host)) {
    return;
  }
  FeatureRegistry.registerAll(defaultFeatureDescriptors);
  Toolbar.init();
  await FeatureRegistry.initAll();
})();
