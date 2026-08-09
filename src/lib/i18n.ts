export type Language = "uk" | "en";

export const TRANSLATIONS = {
  uk: {
    // Header & Global
    appName: "DROPAGG.",
    tagline: "Персональний агрегатор дропів та одягу",
    addBrand: "Додати магазин",
    syncAll: "Оновити все",
    syncingAll: "Оновлення магазинів...",
    allStoresSynced: "Усі магазини оновлено",
    searchPlaceholder: "Пошук дропів...",
    navCatalog: "Каталог",
    navBrands: "Магазини",

    // Welcome Screen
    welcomeBadge: "АГРЕГАТОР СТРІТВІР ДРОПІВ",
    welcomeTitle: "Відстежуйте Дропи Та Поповнення",
    welcomeSubtitle: "З Будь-Якого Магазину",
    welcomeDesc: "DropAgg — ваш персональний робочий простір для відстеження релізів, нових колекцій та наявності розмірів у ваших улюблених брендах. Усе зберігається локально на вашому пристрої.",
    inputPlaceholder: "Вставте URL (наприклад, https://riotdivision.tech)",
    addFirstStore: "Додати перший магазин",
    trySample: "Або спробуйте популярний магазин:",

    // Feature Cards
    feature1Title: "Універсальна сумісність",
    feature1Desc: "Підтримує Shopify, Wix, Tilda та кастомні HTML-магазини. Просто вставте посилання.",
    feature2Title: "Локальне зберігання (Local-First)",
    feature2Desc: "Усі дані зберігаються на вашому пристрої. Реєстрація не потрібна, працює миттєво.",
    feature3Title: "Наявність розмірів у реальному часі",
    feature3Desc: "Наведіть на товар, щоб одразу побачити наявні розміри S, M, L, XL.",

    // Catalog & Filters
    allDrops: "Усі Дропи",
    results: "результатів",
    filters: "Фільтри",
    resetFilters: "Скинути",
    category: "Категорія",
    brand: "Бренд",
    maxPrice: "Максимальна ціна",
    noProducts: "Товарів не знайдено у вашому просторі.",
    addBrandPrompt: "Натисніть 'Додати магазин' у шапці сайту, щоб додати перший бренд.",

    // Gender Filter
    gender: "Стать",
    allGenders: "Усі",
    menGender: "Чоловічий",
    womenGender: "Жіночий",
    unisexGender: "Унісекс",

    // Favorites / Wishlist
    favorites: "Обране",
    favoritesOnly: "Тільки обране",
    noFavorites: "У вас ще немає збережених товарів в обраному. Натисніть ❤️ на будь-якому товарі, щоб зберегти його!",

    // Brands Management Page
    trackedBrandsTitle: "Підключені магазини",
    trackedBrandsDesc: "Керуйте підключеними брендами, оновлюйте їхні дані або видаляйте їх з вашого простору.",
    noBrandsTitle: "Ще немає підключених магазинів",
    noBrandsDesc: "Додайте URL магазину одягу, щоб почати відстеження його дропів та товарів.",
    viewProducts: "Переглянути товари",
    syncStore: "Оновити магазин",
    deleteStore: "Видалити магазин",
    confirmDelete: "Підтвердити видалення?",
    syncTriggered: "Оновлення запущено! Нові товари з'являться в каталозі незабаром.",

    // Sorting
    sortBy: "Сортування",
    newestDrops: "Спочатку нові дропи",
    newestStores: "Спочатку нові магазини",
    priceAsc: "Ціна: від дешевших до дорожчих",
    priceDesc: "Ціна: від дорожчих до дешевших",

    // Add Brand Modal
    modalTagline: "Відстеження нового магазину",
    modalTitle: "Введіть URL магазину",
    modalDesc: "Введіть посилання на будь-який магазин одягу (Shopify, Wix, Tilda, Custom HTML).",
    modalPlaceholder: "https://riotdivision.tech",
    cancel: "Скасувати",
    addStore: "Додати магазин",
    scanning: "Сканування...",

    // Status & Sold Out
    inStock: "В наявності",
    outOfStock: "Немає в наявності",
    soldOut: "ПРОДАНО",
  },

  en: {
    // Header & Global
    appName: "DROPAGG.",
    tagline: "Personal Streetwear & Drop Aggregator",
    addBrand: "Add Brand",
    syncAll: "Sync All",
    syncingAll: "Syncing Stores...",
    allStoresSynced: "All Stores Synced",
    searchPlaceholder: "Search drops...",
    navCatalog: "Catalog",
    navBrands: "Brands",

    // Welcome Screen
    welcomeBadge: "STREETWEAR DROP AGGREGATOR",
    welcomeTitle: "Track Drops & Restocks",
    welcomeSubtitle: "From Any Store",
    welcomeDesc: "DropAgg is your personal workspace for tracking clothing drops, new releases, and size availability across your favorite streetwear brands — all saved directly on your local device.",
    inputPlaceholder: "Paste store URL (e.g., https://riotdivision.tech)",
    addFirstStore: "Add First Store",
    trySample: "Or try a sample store:",

    // Feature Cards
    feature1Title: "Universal Compatibility",
    feature1Desc: "Supports Shopify, Wix, Tilda, and custom HTML stores. Simply paste any store URL.",
    feature2Title: "Local-First Storage",
    feature2Desc: "All data is saved locally on your device. Zero account creation required.",
    feature3Title: "Real-Time Size Tracking",
    feature3Desc: "Hover over any product to see in-stock vs out-of-stock sizes instantly.",

    // Catalog & Filters
    allDrops: "All Drops",
    results: "results",
    filters: "Filters",
    resetFilters: "Reset",
    category: "Category",
    brand: "Brand",
    maxPrice: "Max Price",
    noProducts: "No products found in your workspace.",
    addBrandPrompt: "Click 'Add Brand' in the top header to track a store and populate your catalog.",

    // Gender Filter
    gender: "Gender",
    allGenders: "All",
    menGender: "Men's",
    womenGender: "Women's",
    unisexGender: "Unisex",

    // Favorites / Wishlist
    favorites: "Favorites",
    favoritesOnly: "Favorites Only",
    noFavorites: "You have no saved favorite items yet. Click ❤️ on any item to save it!",

    // Brands Management Page
    trackedBrandsTitle: "Tracked Stores",
    trackedBrandsDesc: "Manage your connected streetwear brands, refresh their data, or remove them from your local workspace.",
    noBrandsTitle: "No brands connected yet",
    noBrandsDesc: "Add a streetwear brand website URL to start tracking its drops and catalog items.",
    viewProducts: "View Products",
    syncStore: "Refresh Store",
    deleteStore: "Delete Store",
    confirmDelete: "Confirm Delete?",
    syncTriggered: "Syncing... New items will populate in catalog shortly!",

    // Sorting
    sortBy: "Sort by",
    newestDrops: "Newest Drops (Recent Items)",
    newestStores: "Newest Stores (Recently Added Brands)",
    priceAsc: "Price: Low to High",
    priceDesc: "Price: High to Low",

    // Add Brand Modal
    modalTagline: "Track New Store",
    modalTitle: "Add Store URL",
    modalDesc: "Enter any streetwear or clothing brand store URL (Shopify, Wix, Tilda, Custom HTML).",
    modalPlaceholder: "https://riotdivision.tech",
    cancel: "Cancel",
    addStore: "Add Store",
    scanning: "Scanning...",

    // Status & Sold Out
    inStock: "In Stock",
    outOfStock: "Out of Stock",
    soldOut: "SOLD OUT",
  },
};

// Category translation mapping dictionary for common clothing terms
const CATEGORY_TRANSLATIONS: Record<string, { uk: string; en: string }> = {
  hoodies: { uk: "Худі", en: "Hoodies" },
  hoodie: { uk: "Худі", en: "Hoodie" },
  "t-shirts": { uk: "Футболки", en: "T-Shirts" },
  "t-shirt": { uk: "Футболка", en: "T-Shirt" },
  tees: { uk: "Футболки", en: "T-Shirts" },
  tee: { uk: "Футболка", en: "T-Shirt" },
  jackets: { uk: "Куртки", en: "Jackets" },
  jacket: { uk: "Куртка", en: "Jacket" },
  outerwear: { uk: "Верхній одяг", en: "Outerwear" },
  pants: { uk: "Штани", en: "Pants" },
  trousers: { uk: "Штани", en: "Trousers" },
  jeans: { uk: "Джинси", en: "Jeans" },
  shorts: { uk: "Шорти", en: "Shorts" },
  sweatshirts: { uk: "Світшоти", en: "Sweatshirts" },
  sweatshirt: { uk: "Світшот", en: "Sweatshirt" },
  crewnecks: { uk: "Світшоти", en: "Crewnecks" },
  sweaters: { uk: "Светри", en: "Sweaters" },
  accessories: { uk: "Аксесуари", en: "Accessories" },
  headwear: { uk: "Головні убори", en: "Headwear" },
  hats: { uk: "Шапки та кепки", en: "Hats & Caps" },
  caps: { uk: "Кепки", en: "Caps" },
  footwear: { uk: "Взуття", en: "Footwear" },
  shoes: { uk: "Взуття", en: "Shoes" },
  sneakers: { uk: "Кросівки", en: "Sneakers" },
  bags: { uk: "Сумки та рюкзаки", en: "Bags & Backpacks" },
  backpacks: { uk: "Рюкзаки", en: "Backpacks" },
};

/**
 * Translates generic clothing categories into active language.
 * If it's a proper noun / custom brand-specific name, leaves it unchanged.
 */
export function translateCategory(category: string, lang: Language): string {
  if (!category) return "";
  const key = category.trim().toLowerCase();
  if (CATEGORY_TRANSLATIONS[key]) {
    return CATEGORY_TRANSLATIONS[key][lang] || category;
  }
  return category;
}

export function detectBrowserLanguage(): Language {
  if (typeof window === "undefined") return "uk";

  // Check saved language cookie / localStorage first
  const saved = localStorage.getItem("dropagg_lang");
  if (saved === "uk" || saved === "en") return saved;

  // Check navigator languages for uk, uk-UA
  const langs = navigator.languages || [navigator.language || ""];
  const isUkrainian = langs.some(
    (l) => l.toLowerCase().startsWith("uk") || l.toLowerCase() === "uk-ua"
  );

  return isUkrainian ? "uk" : "en";
}

export function setPreferredLanguage(lang: Language) {
  if (typeof window === "undefined") return;
  localStorage.setItem("dropagg_lang", lang);
  document.cookie = `dropagg_lang=${lang}; path=/; max-age=31536000`;
}
