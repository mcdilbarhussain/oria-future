import { requirePage, ebayAccountScope } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { PageHeader, Card } from "@/components/ui";
import { ActionForm, SubmitButton } from "@/components/forms";
import { saveListing } from "../../actions";
import { ListingFields } from "../form";

export default async function NewListing({ searchParams }: { searchParams: Promise<{ product?: string }> }) {
  const u = await requirePage("ebay_listings", "create");
  const { product } = await searchParams;
  const [accounts, products] = await Promise.all([
    prisma.ebayAccount.findMany({ where: { deletedAt: null, ...ebayAccountScope(u) }, select: { id: true, name: true } }),
    prisma.product.findMany({ where: { deletedAt: null }, select: { id: true, sku: true, name: true, sellPrice: true, description: true }, orderBy: { sku: "asc" } }),
  ]);
  const p = products.find((x) => x.id === product);
  return (
    <>
      <PageHeader back={{ href: "/ebay/listings", label: "Listings" }} title="New eBay listing" subtitle="Saved as a draft. Publish it from the listing page once the account is connected and policies are loaded." />
      <Card>
        <ActionForm action={saveListing} redirectTo="/ebay/listings?status=DRAFT">
          <ListingFields accounts={accounts} products={products} l={p ? { productId: p.id, sku: p.sku, title: p.name.slice(0, 80), price: p.sellPrice, description: p.description } : undefined} />
          <div className="mt-6 flex justify-end"><SubmitButton>Save draft</SubmitButton></div>
        </ActionForm>
      </Card>
    </>
  );
}
