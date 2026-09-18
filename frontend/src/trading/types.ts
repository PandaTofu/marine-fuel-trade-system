export type DecimalText = string;
export type Component = 'customer_deposit'|'customer_received'|'supplier_deposit'|'supplier_paid';
export const components: Component[] = ['customer_deposit','customer_received','supplier_deposit','supplier_paid'];
export interface Line {
  id?: number; oil: string; ordered_qty_min: DecimalText; ordered_qty_max: DecimalText; actual_qty: DecimalText|null;
  sale_price: DecimalText; cost_price: DecimalText; sale_amount?: string; cost_amount?: string;
}
export interface Numbers extends Record<Component, string> {
  quantity:string; sales:string; cost:string; commission:string; profit:string;
  receivable:string; payable:string; customer_due:string|null; supplier_due:string|null;
  customer_status:string; supplier_status:string;
}
export interface Order {
  id:number; public_id:string; number:string; version:number; state:string;
  order_date:string; customer:string; supplier:string; vessel:string; port:string; imo:string;
  estimated_start_date:string|null; estimated_end_date:string|null; actual_date:string|null; customer_term_description:string; customer_term:number; supplier_term_description:string; supplier_term:number;
  commission_rate:string; commission_recipient:string; salesperson:string; currency:'USD';
  customer_fee:string; supplier_fee:string; berth_fee:string; exceptional_fee:string; note:string; lines:Line[]; numbers:Numbers;
}
export interface Account {
  id:number; name:string; currency:'USD'; opening_balance:string; balance:string;
  share:string|null; is_default:boolean; is_active:boolean; note:string; version:number; has_entries:boolean;
  ledger_income:string; ledger_expense:string;
}
export interface Entry {
  id:number; account:number; account_name:string; order:number|null; order_number:string;
  date:string; direction:'income'|'expense'; category:string; amount:string; component:Component|'';
  settlement_delta:string; source:string; reason:string; actor_name:string; reversed:boolean;
}
export interface Summary {
  sales:string; cost:string; commission:string; profit:string; receivable:string; payable:string;
  customer_fee:string; supplier_fee:string; berth_fee:string; exceptional_fee:string; order_count:number; pending_count:number;
  receivable_count:number; payable_count:number; customer_overdue:string; supplier_overdue:string;
  partial_receipts:number; net_expected:string;
}
export interface OrderList { count:number; results:Order[]; summary:Summary }
export interface AccountList { results:Account[]; total_balance:string; count:number }
export interface LedgerList { count:number; results:Entry[]; income:string; expense:string; net:string }
export interface Dashboard extends Summary {total_balance:string; account_count:number; month_order_count:number; month_profit:string; overdue:Order[]}
export interface Revision {version:number; action:string; actor:string; reason:string; created_at:string; snapshot:Order}

