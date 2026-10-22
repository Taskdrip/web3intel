import { and, eq, isNull } from "drizzle-orm";
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
  ["asic-fleet-insight-dashboard", "ASIC Fleet Insight Dashboard", "Software", "A self-hosted operations dashboard concept for keeping miner inventory, uptime notes, and maintenance events in one place. Confirm supported hardware, integrations, hosting requirements, and licensing with the seller before purchase.", "Digital listing. Verify supported devices, data inputs, deployment method, update policy, license, and support terms."],
  ["mining-watchdog-scripts", "Mining Watchdog Scripts Pack", "Scripts", "A collection of operator-oriented script concepts for routine fleet checks and alert workflows. Review the source, dependencies, permissions, and execution environment before running any third-party code.", "Digital listing. Inspect source code, required permissions, dependencies, supported operating systems, and update policy before use."],
  ["mining-profitability-calculator", "Mining Profitability Calculator", "Applications", "A planning tool concept for comparing user-entered hardware, energy, pool, and operating-cost assumptions. Results are estimates based on inputs and do not predict mining income or asset prices.", "Digital listing. Verify calculation methodology, supported currencies, fee assumptions, export options, and license."],
  ["mining-operations-template-kit", "Mining Operations Template Kit", "Web3 & blockchain templates", "A set of editable planning templates for equipment records, maintenance schedules, energy costs, and deployment checklists. Templates are starting points; users should validate them for their local operating requirements.", "Digital listing. Confirm included formats, update terms, license, and whether any third-party tools are required."],
  ["pool-analytics-dashboard-template", "Mining Pool Analytics Dashboard Template", "Web3 & blockchain templates", "A dashboard template concept for organizing pool-reported performance and payout records. The seller should document each supported pool API and the limits of its data before purchase.", "Digital listing. Confirm API compatibility, authentication requirements, refresh behavior, and supported deployment stack."],
  ["asic-inventory-maintenance-app", "ASIC Inventory & Maintenance App", "Applications", "An application listing concept for tracking miner serials, locations, repair notes, and scheduled maintenance. Ask the seller to demonstrate the current build and explain where data is stored.", "Digital listing. Verify access controls, backup/export options, deployment requirements, license, and support."],
  ["bitcoin-node-deployment-scripts", "Bitcoin Node Deployment Scripts", "Scripts", "A digital script bundle concept for documenting and automating parts of a self-managed Bitcoin node setup. Review every command and network permission before running scripts on production equipment.", "Digital listing. Inspect source, operating-system support, network changes, required permissions, and maintenance status."],
  ["mining-payments-reporting-tool", "Mining Payout Reconciliation Tool", "Software", "A record-keeping tool concept for importing payout statements and comparing them with operator-maintained records. It does not custody funds, sign transactions, or guarantee that a pool statement is complete.", "Digital listing. Verify import formats, data retention, privacy practices, export support, and license."],
  ["mining-platform-storefront-template", "Mining Platform Storefront Template", "Web3 & blockchain templates", "A customizable web storefront template for mining services or hardware catalogs. It is a front-end template only unless the seller explicitly documents working commerce, security, and fulfillment integrations.", "Digital listing. Confirm framework version, included source files, license, maintenance, and which integrations are actually implemented."],
];

const categoryImages: Record<string, string[]> = {
  "ASIC miners": [
    "/shop/asic-fan-front.webp",
    "/shop/asic-side.webp",
    "/shop/asic-rack.webp",
    "/shop/asic-hydro.webp",
  ],
  "Mini miners": [
    "/shop/mini-open.webp",
    "/shop/mini-desktop.webp",
    "/shop/mini-board.webp",
  ],
  Software: ["/shop/software-dashboard.webp"],
  Scripts: ["/shop/software-dashboard.webp"],
  Applications: ["/shop/software-dashboard.webp"],
  "Web3 & blockchain templates": ["/shop/software-dashboard.webp"],
};

function imageForProduct(category: string, slug: string): string | null {
  const images = categoryImages[category];
  if (!images?.length) return null;
  const stableIndex = [...slug].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return images[stableIndex % images.length] ?? images[0] ?? null;
}

function addHardwareBuyingGuidance(category: string, description: string): string {
  if (category === "ASIC miners") {
    return `${description}\n\nBefore committing to an industrial unit, compare its verified operating profile with the power, ventilation, electrical service, and noise limits at the intended site. Ask for current serial-specific test results, photos, delivery terms, and written warranty coverage. A model name alone does not confirm the revision, condition, availability, or expected mining return.`;
  }
  if (category === "Mini miners") {
    return `${description}\n\nThese compact devices are intended for hobby, learning, or small-scale experimentation; they should not be treated as income-producing substitutes for industrial equipment. Confirm whether the seller is offering an assembled device or kit, the included power supply and cooling, current firmware, and any return or warranty terms.`;
  }
  return description;
}

export async function ensureStarterShopCatalog(): Promise<void> {
  const existing = await db.select({
    slug: shopProductsTable.slug,
    imageUrl: shopProductsTable.imageUrl,
  }).from(shopProductsTable);
  const existingSlugs = new Set(existing.map((product) => product.slug));
  const missingProducts = starterProducts.filter(([slug]) => !existingSlugs.has(slug));
  if (missingProducts.length) {
    await db.insert(shopProductsTable).values(
      missingProducts.map(([slug, title, category, description, specs]) => ({
      slug,
      title,
      category,
      saleType: "direct",
      fulfillment: ["Software", "Scripts", "Applications", "Web3 & blockchain templates"].includes(category)
        ? "digital"
        : "physical",
      summary: category === "ASIC miners" || category === "Mini miners"
        ? `${title} listing. Contact the seller to verify availability and the exact hardware variant.`
        : `${title}. Review the seller’s supported features, license, and delivery terms before purchase.`,
      description: addHardwareBuyingGuidance(category, description),
      specs,
      imageUrl: imageForProduct(category, slug),
      priceCents: null,
      priceCurrency: "USD",
      affiliateUrl: null,
      status: "active",
      })),
    ).onConflictDoNothing();
  }

  const rowsNeedingImages = new Set(existing
    .filter((product) => product.imageUrl === null)
    .map((product) => product.slug));
  for (const [slug, , category] of starterProducts) {
    const imageUrl = imageForProduct(category, slug);
    if (!rowsNeedingImages.has(slug) || !imageUrl) continue;
    await db.update(shopProductsTable)
      .set({ imageUrl })
      .where(and(eq(shopProductsTable.slug, slug), isNull(shopProductsTable.imageUrl)));
  }
}
