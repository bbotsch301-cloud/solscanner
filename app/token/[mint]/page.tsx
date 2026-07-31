import { getLabel } from "@/lib/labels/labels";
import { TokenDiscussion } from "@/app/components/TokenDiscussion";

export default async function TokenPage({
  params,
}: {
  params: Promise<{ mint: string }>;
}) {
  const { mint } = await params;
  const label = getLabel(mint);
  return <TokenDiscussion mint={mint} tokenName={label?.name} />;
}
