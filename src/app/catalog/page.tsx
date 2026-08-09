import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CatalogFilters } from "@/components/catalog/catalog-filters";
import { Product, ProductVariant, Brand } from "@prisma/client";

type ProductWithRelations = Product & {
  brand: Brand;
  variants: ProductVariant[];
};

interface CatalogPageProps {
  searchParams: Promise<{
    categories?: string;
    category?: string;
    brands?: string;
    maxPrice?: string;
  }>;
}

export default async function CatalogPage({ searchParams }: CatalogPageProps) {
  const currentUser = await getCurrentUser();
  const params = await searchParams;

  const categoryFilters = params.categories
    ? params.categories.split(",").filter(Boolean)
    : params.category
    ? [params.category]
    : [];

  const brandFilters = params.brands ? params.brands.split(",").filter(Boolean) : [];
  const maxPriceFilter = params.maxPrice ? parseFloat(params.maxPrice) : undefined;

  // Base scope: Only products belonging to brands tracked by the current user
  const userBrandFilter = {
    userBrands: {
      some: {
        userId: currentUser.id,
      },
    },
    ...(brandFilters.length > 0 ? { name: { in: brandFilters } } : {}),
  };

  const where: any = {
    brand: userBrandFilter,
  };

  if (categoryFilters.length > 0) {
    where.OR = categoryFilters.map((cat: string) => ({
      category: { contains: cat, mode: "insensitive" },
    }));
  }

  if (maxPriceFilter !== undefined) {
    where.variants = {
      some: {
        OR: [
          { normalizedPrice: { lte: maxPriceFilter } },
          { rawPrice: { lte: maxPriceFilter } },
        ],
      },
    };
  }

  const products: ProductWithRelations[] = await prisma.product.findMany({
    where,
    include: { variants: true, brand: true },
    orderBy: { createdAt: "desc" },
  });

  // Get distinct brands for the active user
  const dbBrands = await prisma.brand.findMany({
    where: {
      userBrands: {
        some: {
          userId: currentUser.id,
        },
      },
    },
    select: { name: true },
    distinct: ["name"],
  });
  const brands = dbBrands.map((b: { name: string }) => b.name);

  // Get distinct categories for the active user's products
  const dbCategories = await prisma.product.findMany({
    where: {
      brand: {
        userBrands: {
          some: {
            userId: currentUser.id,
          },
        },
      },
    },
    select: { category: true },
    distinct: ["category"],
  });
  const rawCategories = dbCategories
    .map((c: { category: string | null }) => c.category)
    .filter((c: string | null): c is string => !!c && c.trim() !== "");

  const availableCategories =
    rawCategories.length > 0
      ? Array.from(new Set<string>(rawCategories))
      : ["Hoodies", "T-Shirts", "Jackets", "Pants", "Accessories"];

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col md:flex-row gap-8">
        
        {/* Interactive Filters Sidebar (Category, Brand, Price) */}
        <CatalogFilters
          availableCategories={availableCategories}
          availableBrands={brands}
          maxPriceLimit={500}
        />

        {/* Product Grid */}
        <div className="flex-1">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold tracking-tight">All Drops</h1>
            <p className="text-sm text-muted-foreground">{products.length} Results</p>
          </div>

          {products.length === 0 ? (
            <div className="text-center py-16 bg-muted/20 rounded-2xl border border-dashed">
              <p className="text-muted-foreground font-medium mb-2">No products found in your workspace.</p>
              <p className="text-xs text-muted-foreground">Add a brand at /suggest to see your personal catalog drops.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {products.map((product: ProductWithRelations) => (
                <div key={product.id} className="group">
                  <Card className="overflow-hidden border-0 bg-transparent shadow-none">
                    <CardContent className="p-0 relative">
                      <div className="aspect-[3/4] overflow-hidden rounded-xl bg-muted relative mb-4">
                        <img 
                          src={product.mainImage || "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?auto=format&fit=crop&q=80&w=800"} 
                          alt={product.title} 
                          className="object-cover w-full h-full transition-transform duration-500 group-hover:scale-105"
                        />
                        <div className="absolute top-3 left-3 flex flex-col gap-2">
                          <Badge className="bg-background/90 text-foreground backdrop-blur-sm hover:bg-background">
                            {product.brand.name}
                          </Badge>
                        </div>
                        
                        {/* Size availability overlay on hover */}
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end justify-center pb-6">
                          <div className="flex flex-wrap gap-1.5 justify-center px-4">
                            {product.variants.map((v: ProductVariant) => (
                              <span 
                                key={v.id} 
                                className={`px-2.5 py-1 flex items-center justify-center rounded-md text-xs font-bold ${v.availability === 'IN_STOCK' ? 'bg-white text-black' : 'bg-white/30 text-white/50 line-through'}`}
                                title={v.availability === 'IN_STOCK' ? 'In Stock' : 'Out of Stock'}
                              >
                                {v.size}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="space-y-1">
                        <h3 className="font-medium text-lg leading-tight">{product.title}</h3>
                        <p className="text-muted-foreground">
                          ${product.variants[0]?.normalizedPrice ? Number(product.variants[0].normalizedPrice) : (product.variants[0]?.rawPrice ? Number(product.variants[0].rawPrice) : 0)} USD
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
