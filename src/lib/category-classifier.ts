/**
 * Intelligently classifies product category from title, tags, productType, and handle.
 */
export function inferCategory(
  title: string = "",
  productType: string = "",
  tags: string[] | string = [],
  description: string = ""
): string {
  const tagString = Array.isArray(tags) ? tags.join(" ") : String(tags || "");
  const text = `${title} ${productType} ${tagString} ${description}`.toLowerCase();

  if (
    text.includes("hoodie") ||
    text.includes("hooded") ||
    text.includes("худі") ||
    text.includes("худи") ||
    text.includes("zip hoodie") ||
    text.includes("zip-up")
  ) {
    return "Hoodies";
  }

  if (
    text.includes("t-shirt") ||
    text.includes("tshirt") ||
    text.includes(" tee") ||
    text.startsWith("tee") ||
    text.includes("футболка") ||
    text.includes("футболки")
  ) {
    return "T-Shirts";
  }

  if (
    text.includes("jacket") ||
    text.includes("coat") ||
    text.includes("parka") ||
    text.includes("anorak") ||
    text.includes("bomber") ||
    text.includes("windbreaker") ||
    text.includes("vest") ||
    text.includes("куртка") ||
    text.includes("анорак") ||
    text.includes("жилет") ||
    text.includes("пальто")
  ) {
    return "Jackets";
  }

  if (
    text.includes("sweatshirt") ||
    text.includes("crewneck") ||
    text.includes("sweater") ||
    text.includes("світшот") ||
    text.includes("свитшот") ||
    text.includes("джемпер")
  ) {
    return "Sweatshirts";
  }

  if (
    text.includes("pants") ||
    text.includes("trousers") ||
    text.includes("sweatpants") ||
    text.includes("cargo") ||
    text.includes("jeans") ||
    text.includes("штани") ||
    text.includes("брюки") ||
    text.includes("джинси") ||
    text.includes("джинсы") ||
    text.includes("карго")
  ) {
    return "Pants";
  }

  if (text.includes("shorts") || text.includes("шорти") || text.includes("шорты")) {
    return "Shorts";
  }

  if (
    text.includes("cap") ||
    text.includes("beanie") ||
    text.includes("hat") ||
    text.includes("bucket hat") ||
    text.includes("панама") ||
    text.includes("шапка") ||
    text.includes("кепка")
  ) {
    return "Headwear";
  }

  if (
    text.includes("bag") ||
    text.includes("backpack") ||
    text.includes("wallet") ||
    text.includes("belt") ||
    text.includes("socks") ||
    text.includes("keychain") ||
    text.includes("сумка") ||
    text.includes("рюкзак") ||
    text.includes("шкарпетки") ||
    text.includes("носки")
  ) {
    return "Accessories";
  }

  if (
    text.includes("shoe") ||
    text.includes("sneaker") ||
    text.includes("boot") ||
    text.includes("slide") ||
    text.includes("кросівки") ||
    text.includes("взуття")
  ) {
    return "Footwear";
  }

  // If productType is provided and isn't generic "Clothing" / "Apparel", use clean title case
  const cleanType = (productType || "").trim();
  if (
    cleanType &&
    !["clothing", "apparel", "default", "all", "product", "item"].includes(cleanType.toLowerCase())
  ) {
    return cleanType.charAt(0).toUpperCase() + cleanType.slice(1);
  }

  return "Clothing";
}
