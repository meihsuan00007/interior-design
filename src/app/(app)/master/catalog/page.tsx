import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { listCatalogItems } from "@/server/master/catalog";
import { listTrades } from "@/server/master/trades";
import { listUnits } from "@/server/master/units";
import { listVendors } from "@/server/master/vendors";
import { getMasterPageContext } from "../_components/page-context";
import { CatalogManager } from "./view";

type SearchParams = Promise<{ trade?: string; q?: string }>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CatalogPage({ searchParams }: { searchParams: SearchParams }) {
  const { trade, q } = await searchParams;
  const tradeId = trade && UUID.test(trade) ? trade : undefined;
  const query = q?.trim() ?? "";
  const { orgId, canEdit } = await getMasterPageContext();

  const [items, trades, units, vendors] = await Promise.all([
    listCatalogItems(orgId, { tradeId, q: query }),
    listTrades(orgId),
    listUnits(orgId),
    listVendors(orgId),
  ]);

  return (
    <div className="space-y-6">
      <form method="get" className="flex flex-col gap-3 md:flex-row md:items-center">
        <select
          name="trade"
          defaultValue={tradeId ?? ""}
          aria-label="依工種篩選"
          className="h-9 rounded-lg border border-input bg-background px-3 text-sm md:w-48"
        >
          <option value="">全部工種</option>
          {trades.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <Input name="q" defaultValue={query} placeholder="搜尋品項名稱" aria-label="搜尋品項名稱" className="md:max-w-xs" />
        <div className="flex gap-2">
          <Button type="submit" variant="secondary">
            搜尋
          </Button>
          {(tradeId || query) && (
            <Button asChild variant="ghost">
              <Link href="/master/catalog">清除</Link>
            </Button>
          )}
        </div>
      </form>

      <CatalogManager
        items={items}
        trades={trades.map((t) => ({ id: t.id, name: t.name }))}
        units={units.map((u) => ({ id: u.id, name: u.name }))}
        vendors={vendors.map((v) => ({ id: v.id, name: v.name }))}
        canEdit={canEdit}
        filtered={Boolean(tradeId || query)}
      />
    </div>
  );
}
