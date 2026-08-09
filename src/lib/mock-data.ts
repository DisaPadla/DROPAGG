export type ProductVariant = {
  id: string;
  size: string;
  color: string;
  availability: 'IN_STOCK' | 'OUT_OF_STOCK';
  price: number; // in USD (Normalized)
};

export type Product = {
  id: string;
  brand: string;
  title: string;
  category: string;
  mainImage: string;
  variants: ProductVariant[];
};

export const mockProducts: Product[] = [
  {
    id: "p1",
    brand: "Localize",
    title: "Heavyweight Boxy Hoodie",
    category: "Hoodies",
    mainImage: "https://images.unsplash.com/photo-1556821840-3a63f95609a7?auto=format&fit=crop&q=80&w=800",
    variants: [
      { id: "v1_1", size: "M", color: "Black", availability: "IN_STOCK", price: 85 },
      { id: "v1_2", size: "L", color: "Black", availability: "OUT_OF_STOCK", price: 85 },
      { id: "v1_3", size: "XL", color: "Black", availability: "IN_STOCK", price: 85 },
    ]
  },
  {
    id: "p2",
    brand: "Void Archive",
    title: "Cargo Parachute Pants",
    category: "Pants",
    mainImage: "https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?auto=format&fit=crop&q=80&w=800",
    variants: [
      { id: "v2_1", size: "S", color: "Olive", availability: "IN_STOCK", price: 110 },
      { id: "v2_2", size: "M", color: "Olive", availability: "IN_STOCK", price: 110 },
      { id: "v2_3", size: "L", color: "Olive", availability: "OUT_OF_STOCK", price: 110 },
    ]
  },
  {
    id: "p3",
    brand: "Neo Tokyo",
    title: "Graphic Cyber Tee",
    category: "T-Shirts",
    mainImage: "https://images.unsplash.com/photo-1576566588028-4147f3842f27?auto=format&fit=crop&q=80&w=800",
    variants: [
      { id: "v3_1", size: "M", color: "White", availability: "OUT_OF_STOCK", price: 45 },
      { id: "v3_2", size: "L", color: "White", availability: "IN_STOCK", price: 45 },
      { id: "v3_3", size: "XL", color: "White", availability: "IN_STOCK", price: 45 },
    ]
  },
  {
    id: "p4",
    brand: "Localize",
    title: "Washed Denim Jacket",
    category: "Jackets",
    mainImage: "https://images.unsplash.com/photo-1576871337622-98d48d1cf531?auto=format&fit=crop&q=80&w=800",
    variants: [
      { id: "v4_1", size: "L", color: "Blue", availability: "IN_STOCK", price: 150 },
      { id: "v4_2", size: "XL", color: "Blue", availability: "IN_STOCK", price: 150 },
    ]
  },
  {
    id: "p5",
    brand: "Void Archive",
    title: "Tactical Vest",
    category: "Jackets",
    mainImage: "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?auto=format&fit=crop&q=80&w=800",
    variants: [
      { id: "v5_1", size: "OS", color: "Black", availability: "IN_STOCK", price: 130 },
    ]
  }
];

export const mockBrands = ["Localize", "Void Archive", "Neo Tokyo"];
export const mockCategories = ["Hoodies", "Pants", "T-Shirts", "Jackets"];
export const mockSizes = ["S", "M", "L", "XL", "OS"];
