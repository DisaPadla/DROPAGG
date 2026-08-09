const FEMALE_KEYWORDS = [
  "women",
  "womens",
  "women's",
  "woman",
  "wmns",
  "wmn",
  "female",
  "lady",
  "ladies",
  "girl",
  "girls",
  "skirt",
  "dress",
  "crop top",
  "croptop",
  "cropped",
  "baby tee",
  "baby t-shirt",
  "offtop",
  "bodysuit",
  "bikini",
  "lingerie",
  "bra",
  "bralette",
  "leggings",
  "corset",
  "blouse",
  "heels",
  "mary jane",
  "handbag",
  "purse",
  "clutch",
  "жіноч",
  "жіноче",
  "жіночий",
  "жіночі",
  "для жінок",
  "дівчач",
  "дівчат",
  "сукня",
  "сукні",
  "спідниця",
  "спідниці",
  "бюстгальтер",
  "боді",
  "боди",
  "топ",
  "топік",
  "вкорочений",
  "вкорочена",
  "вкорочені",
  "укороченный",
  "укороченное",
  "укороченная",
  "палацо",
  "палаццо",
  "приталена",
  "приталений",
  "приталені",
  "приталенная",
  "косинка",
  "косинки",
  "корсет",
  "сарафан",
  "колготки",
  "панчохи",
  "клатч",
  "сережки",
  "серьги",
  "женск",
  "женский",
  "женское",
  "женские",
  "для женщин",
  "платье",
  "юбка",
  "юбки",
];

const MALE_KEYWORDS = [
  "men",
  "mens",
  "men's",
  "man",
  "male",
  "guy",
  "guys",
  "boy",
  "boys",
  "чоловіч",
  "чоловічий",
  "чоловіче",
  "чоловічі",
  "для чоловіків",
  "хлопчач",
  "мужск",
  "мужской",
  "мужское",
  "мужские",
  "для мужчин",
];

export function isFemaleProduct(
  title: string = "",
  category: string = "",
  description: string = "",
  url: string = ""
): boolean {
  const text = `${title} ${category} ${description} ${url}`.toLowerCase();

  return FEMALE_KEYWORDS.some((kw) => {
    if (kw.length <= 4) {
      const regex = new RegExp(`(?:^|\\s|\\b)${kw}(?:$|\\s|\\b)`, "i");
      return regex.test(text);
    }
    return text.includes(kw);
  });
}

export function isMaleProduct(
  title: string = "",
  category: string = "",
  description: string = "",
  url: string = ""
): boolean {
  const text = `${title} ${category} ${description} ${url}`.toLowerCase();
  return MALE_KEYWORDS.some((kw) => {
    if (kw.length <= 4) {
      const regex = new RegExp(`(?:^|\\s|\\b)${kw}(?:$|\\s|\\b)`, "i");
      return regex.test(text);
    }
    return text.includes(kw);
  });
}

export function filterProductsByGender<
  T extends { title?: string; category?: string; description?: string; canonicalUrl?: string }
>(products: T[], gender: string): T[] {
  if (!gender || gender === "all") return products;

  if (gender === "women") {
    return products.filter((p) =>
      isFemaleProduct(p.title || "", p.category || "", p.description || "", p.canonicalUrl || "")
    );
  }

  if (gender === "men") {
    return products.filter((p) => {
      // Exclude strictly female products
      const female = isFemaleProduct(
        p.title || "",
        p.category || "",
        p.description || "",
        p.canonicalUrl || ""
      );
      return !female;
    });
  }

  if (gender === "unisex") {
    return products.filter((p) => {
      const text = `${p.title} ${p.category} ${p.description || ""}`.toLowerCase();
      const female = isFemaleProduct(
        p.title || "",
        p.category || "",
        p.description || "",
        p.canonicalUrl || ""
      );
      const explicitMale = text.includes("men's") || text.includes("mens ");
      return !female && !explicitMale;
    });
  }

  return products;
}
