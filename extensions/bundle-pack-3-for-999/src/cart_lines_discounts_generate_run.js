import { DiscountClass } from "../generated/api";
import { isBundleDiscountConfig, runBundleDiscount } from "./bundle_discount";
import { runVolumeDiscount } from "./volume_discount";
import { runFlatOffDiscount } from "./flat_off_discount";

/**
 * @typedef {import("../generated/api").CartInput} RunInput
 * @typedef {import("../generated/api").CartLinesDiscountsGenerateRunResult} CartLinesDiscountsGenerateRunResult
 */

/**
 * @param {RunInput} input
 * @returns {CartLinesDiscountsGenerateRunResult}
 */
export function cartLinesDiscountsGenerateRun(input) {
  if (!input.cart.lines.length) {
    return { operations: [] };
  }

  const bundleConfigValue = input.discount.bundleConfig?.value;
  const volumeConfigValue = input.discount.volumeConfig?.value;
  const flatOffConfigValue = input.discount.functionConfig?.value;

  if (bundleConfigValue && isBundleDiscountConfig(bundleConfigValue)) {
    return runBundleDiscount(input, bundleConfigValue);
  }

  if (input.discount.discountClasses.includes(DiscountClass.Product)) {
    if (flatOffConfigValue) {
      return runFlatOffDiscount(input, flatOffConfigValue);
    }

    if (volumeConfigValue) {
      return runVolumeDiscount(input, volumeConfigValue);
    }

    return { operations: [] };
  }

  return { operations: [] };
}
