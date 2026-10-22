import { db, shopProductsTable } from "@workspace/db";

const starterProducts = [
  ["antminer-s21", "Bitmain Antminer S21", "ASIC miners", "Established SHA-256 ASIC hardware for buyers comparing current Bitmain-generation machines. The exact revision, operating environment, warranty and delivery terms must be confirmed with the seller before purchase.", "Confirm the offered unit's current manufacturer datasheet, hashrate, power draw, voltage, cooling requirements, PSU and warranty. Seller-provided details should be checked before payment."],
  ["antminer-s21-pro", "Bitmain Antminer S21 Pro", "ASIC miners", "A higher-tier S21 family listing for operators evaluating an updated Bitmain SHA-256 unit. Ask the seller to identify the precise variant and provide current specifications and condition details.", "Confirm exact variant, hashrate, power draw, voltage, cooling, PSU, hardware condition and warranty against the seller's current datasheet."],
  ["antminer-s21-xp", "Bitmain Antminer S21 XP", "ASIC miners", "A premium S21-family SHA-256 miner listing intended for buyers who want to compare Bitmain's XP model with other fleet options. Verify the revision and sale condition with the supplier.", "Confirm exact variant, hashrate, power draw, voltage, cooling, PSU, hardware condition and warranty against the seller's current datasheet."],
  ["antminer-s21-xp-hydro", "Bitmain Antminer S21 XP Hydro", "ASIC miners", "A hydro-cooled S21 XP family listing for facilities designed around liquid cooling. Cooling infrastructure, fittings and installation requirements vary; confirm system compatibility before ordering.", "Confirm unit revision, hashrate, power draw, coolant loop, fittings, facility requirements, PSU and warranty with the supplier."],
  ["antminer-s19-xp", "Bitmain Antminer S19 XP", "ASIC miners", "An established S19-family SHA-256 miner listing for operators comparing used and refurbished fleet hardware. Ask for a serial-specific condition report and test results before purchase.", "Confirm condition, test results, hashrate, power draw, voltage, cooling, PSU, repair history and warranty for the exact unit."],
  ["antminer-s19j-pro", "Bitmain Antminer S19j Pro", "ASIC miners", "A familiar S19-family SHA-256 model for buyers assessing second-hand or refurbished units. Available versions and condition can differ significantly, so confirm the exact machine before checkout.", "Confirm the exact variant, board condition, test results, hashrate, power draw, cooling, PSU, repair history and warranty."],
  ["antminer-s19k-pro", "Bitmain Antminer S19k Pro", "ASIC miners", "A SHA-256 S19-series listing for buyers comparing fleet additions across different equipment generations. The listing does not guarantee availability or condition; request supplier confirmation.", "Confirm exact variant, condition, hashrate, power draw, voltage, cooling, PSU and warranty with the supplier."],
  ["whatsminer-m60s", "MicroBT WhatsMiner M60S", "ASIC miners", "A MicroBT SHA-256 miner listing for buyers comparing current-generation equipment across manufacturers. Confirm the exact batch, electrical requirements and seller warranty before ordering.", "Confirm exact revision, hashrate, power draw, voltage, cooling, PSU, condition and warranty with the supplier."],
  ["whatsminer-m60s-plus-plus", "MicroBT WhatsMiner M60S++", "ASIC miners", "A WhatsMiner M60 family listing for fleet operators comparing MicroBT equipment. Ask the supplier to verify the exact product name, batch and datasheet for the offered unit.", "Confirm official model designation, revision, hashrate, power draw, voltage, cooling, PSU, condition and warranty."],
  ["whatsminer-m50s", "MicroBT WhatsMiner M50S", "ASIC miners", "An M50-series SHA-256 listing suited to buyers assessing equipment across new, used and refurbished markets. Request a current test report and shipping details before purchase.", "Confirm exact variant, test report, hashrate, power draw, voltage, cooling, PSU, repair history and warranty."],
  ["whatsminer-m50", "MicroBT WhatsMiner M50", "ASIC miners", "A SHA-256 WhatsMiner family listing for buyers comparing operating costs and fleet compatibility. Available configurations and used-unit condition vary; supplier verification is essential.", "Confirm exact variant, hashrate, power draw, voltage, cooling, PSU, operating condition and warranty."],
  ["avalon-a15-pro", "Canaan Avalon A15 Pro", "ASIC miners", "An Avalon A15 family SHA-256 listing for buyers comparing Canaan hardware with other ASIC manufacturers. Confirm the exact specification sheet and fulfillment terms before checkout.", "Confirm exact variant, hashrate, power draw, voltage, cooling, PSU, condition and warranty with the supplier."],
  ["avalon-a1466", "Canaan Avalon A1466", "ASIC miners", "A Canaan SHA-256 miner listing for operators comparing Avalon fleet equipment. The seller should confirm the offered revision, condition and expected delivery before payment.", "Confirm exact variant, hashrate, power draw, voltage, cooling, PSU, condition and warranty."],
  ["bitaxe-gamma", "Bitaxe Gamma", "Mini miners", "A compact, open-source solo-mining device for hobbyists who want a small, low-footprint Bitcoin mining setup. It is intended for experimentation and lottery-style solo mining, not guaranteed mining income.", "Confirm the board revision, assembled or kit condition, controller, power supply, cooling, firmware and included accessories."],
  ["bitaxe-supra", "Bitaxe Supra", "Mini miners", "An open-source compact Bitcoin miner for enthusiasts interested in solo mining and community-maintained hardware. Confirm the exact board revision and whether the listing includes a power supply or enclosure.", "Confirm the board revision, assembled or kit condition, controller, power supply, cooling, firmware and included accessories."],
  ["bitaxe-ultra", "Bitaxe Ultra", "Mini miners", "A compact Bitaxe family device for hobbyists building a small home solo-mining setup. Different revisions and seller bundles exist; check included parts and current firmware support.", "Confirm exact board revision, assembled or kit condition, controller, power supply, cooling, firmware and included accessories."],
  ["nerdaxe", "NerdAxe", "Mini miners", "A small, community-oriented Bitcoin solo-mining device designed for hobby use. Check the exact hardware revision, assembly state, display and accessories supplied by the seller.", "Confirm board revision, assembly state, controller, power supply, cooling, firmware and included accessories."],
  ["nerdqaxe-plus-plus", "NerdQAxe++", "Mini miners", "A compact multi-chip hobby miner listing for enthusiasts comparing community-built Bitcoin mining devices. Request a current specification sheet and a complete bundle list from the seller.", "Confirm exact revision, chip configuration, hashrate, power draw, cooling, power supply, firmware and accessories."],
  ["nerdminer-v2", "NerdMiner V2", "Mini miners", "A tiny open-source Bitcoin solo-mining project device for learning and experimentation. Its very small scale is for hobby use and does not imply a realistic expectation of mining rewards.", "Confirm board revision, display, firmware, connectivity, power requirements and included accessories."],
  ["futurebit-apollo-btc", "FutureBit Apollo BTC", "Mini miners", "A compact home-oriented Bitcoin mining and node product family for users interested in a quieter, smaller setup than industrial ASIC equipment. Verify the exact bundle, operating mode and support status with the seller.", "Confirm product revision, mining and node components included, operating requirements, accessories, condition and seller warranty."],
  ["avalon-nano-3", "Canaan Avalon Nano 3", "Mini miners", "A compact Avalon family miner listing for home and hobby use. Check exact model details, noise and power requirements, included accessories and the manufacturer's documentation before ordering.", "Confirm exact variant, hashrate, power draw, acoustics, power supply, cooling, accessories and warranty."],
];

export async function ensureStarterShopCatalog(): Promise<void> {
  const existing = await db.select({ id: shopProductsTable.id }).from(shopProductsTable).limit(1);
  if (existing.length) return;
  await db.insert(shopProductsTable).values(
    starterProducts.map(([slug, title, category, description, specs]) => ({
      slug,
      title,
      category,
      saleType: "direct",
      fulfillment: "physical",
      summary: `${title} listing. Contact the seller to verify availability and the exact hardware variant.`,
      description,
      specs,
      priceCents: null,
      priceCurrency: "USD",
      affiliateUrl: null,
      status: "active",
    })),
  ).onConflictDoNothing();
}
