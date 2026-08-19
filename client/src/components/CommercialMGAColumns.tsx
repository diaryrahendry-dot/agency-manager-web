import { TableCell, TableHead } from "@/components/ui/table";
import { formatMGA } from "@shared/currency";

export function CommercialMGAColumnHeader({ show }: { show: boolean }) {
  return show ? <TableHead data-testid="mga-column-header">Équivalent MGA</TableHead> : null;
}

export function CommercialMGAColumnCell({ show, amount, rate }: { show: boolean; amount: number; rate: number }) {
  return show ? (
    <TableCell data-testid="mga-column-cell" className="text-sm font-medium text-slate-600">
      {formatMGA(amount, rate)}
    </TableCell>
  ) : null;
}
