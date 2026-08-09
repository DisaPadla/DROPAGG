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
    clearAll: "Скинути",
    resetFilters: "Скинути",
    category: "Категорія",
    categories: "Категорії",
    brand: "Бренд",
    brands: "Бренди",
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
    clearAll: "Clear all",
    resetFilters: "Reset",
    category: "Category",
    categories: "Categories",
    brand: "Brand",
    brands: "Brands",
    maxPrice: "Max Price",
    noProducts: "No products found in your workspace.",
    addBrandPrompt: "Click 'Add Brand' in the header to add your first brand.",

    // Gender Filter
    gender: "Gender",
    allGenders: "All",
    menGender: "Men's",
    womenGender: "Women's",
    unisexGender: "Unisex",

    // Favorites / Wishlist
    favorites: "Favorites",
    favoritesOnly: "Favorites only",
    noFavorites: "You have no saved favorites yet. Click ❤️ on any drop to save it!",

    // Brands Management Page
    trackedBrandsTitle: "Connected Stores",
    trackedBrandsDesc: "Manage connected brands, trigger manual syncs, or remove stores from your workspace.",
    noBrandsTitle: "No stores connected yet",
    noBrandsDesc: "Add any apparel store URL to begin tracking drops and inventory.",
    viewProducts: "View Products",
    syncStore: "Sync Store",
    deleteStore: "Delete Store",
    confirmDelete: "Confirm deletion?",
    syncTriggered: "Sync triggered! New items will appear in the catalog shortly.",

    // Sorting
    sortBy: "Sort By",
    newestDrops: "Newest Drops First",
    newestStores: "Newest Stores First",
    priceAsc: "Price: Low to High",
    priceDesc: "Price: High to Low",

    // Add Brand Modal
    modalTagline: "Track New Apparel Store",
    modalTitle: "Enter Store URL",
    modalDesc: "Paste the URL of any clothing brand (Shopify, Wix, Tilda, Custom HTML).",
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

export const CATEGORY_TRANSLATIONS: Record<string, { uk: string; en: string }> = {
  Hoodies: { uk: "Худі та Світшоти", en: "Hoodies & Sweatshirts" },
  Sweatshirts: { uk: "Світшоти", en: "Sweatshirts" },
  "T-Shirts": { uk: "Футболки", en: "T-Shirts" },
  Tops: { uk: "Топи", en: "Tops" },
  Jackets: { uk: "Куртки та Одяг", en: "Jackets & Outerwear" },
  Pants: { uk: "Штани та Джинси", en: "Pants & Jeans" },
  Shorts: { uk: "Шорти", en: "Shorts" },
  Headwear: { uk: "Головні убори", en: "Headwear & Caps" },
  Accessories: { uk: "Аксесуари", en: "Accessories" },
  Footwear: { uk: "Взуття", en: "Footwear" },
  Bags: { uk: "Сумки та Рюкзаки", en: "Bags & Backpacks" },
  Clothing: { uk: "Одяг", en: "Clothing" },
};

export function translateCategory(cat: string, lang: Language): string {
  if (CATEGORY_TRANSLATIONS[cat]) {
    return CATEGORY_TRANSLATIONS[cat][lang];
  }
  return cat;
}

export function detectBrowserLanguage(): Language {
  if (typeof window === "undefined") return "uk";
  const saved = localStorage.getItem("dropagg_lang") as Language;
  if (saved === "uk" || saved === "en") return saved;
  const navLang = navigator.language || "";
  if (navLang.toLowerCase().startsWith("uk") || navLang.toLowerCase().startsWith("ru")) {
    return "uk";
  }
  return "en";
}

export function setPreferredLanguage(lang: Language) {
  if (typeof window !== "undefined") {
    localStorage.setItem("dropagg_lang", lang);
  }
}
