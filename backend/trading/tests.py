"""Stage 2–3 regression cases. Written for user execution; not run at delivery.

Use Django's isolated test database. Never point these cases at a live database.
"""
import copy
import uuid
from concurrent.futures import ThreadPoolExecutor
from datetime import date, timedelta
from decimal import Decimal
from io import BytesIO
from threading import Barrier
from types import SimpleNamespace
from unittest.mock import patch
from zipfile import ZipFile
from xml.etree import ElementTree
from django.db import close_old_connections
from django.test import TestCase, SimpleTestCase, TransactionTestCase, skipUnlessDBFeature
from django.utils import timezone
from rest_framework.test import APIClient
from core.models import Reference, User
from .calculations import state, totals, order_numbers
from .models import Account, Entry, Mutation, Order, OrderRevision, WriteLock
from .services import account_balance
from .documents import SALES_TERMS


def order_payload(supplied=True):
    day = timezone.localdate() - timedelta(days=12)
    return {'order_date': day.isoformat(), 'customer':'客户 A', 'supplier':'供应商 A',
            'vessel':'Vessel A', 'port':'Singapore', 'imo':'',
            'actual_date':day.isoformat() if supplied else None,
            'customer_term':10, 'supplier_term':15, 'commission_rate':'50.0000',
            'customer_fee':'100.00', 'supplier_fee':'50.00', 'berth_fee':'1000.00', 'exceptional_fee':'0.00',
            'salesperson':'李明', 'currency':'USD',
            'lines':[
                {'oil':'VLSFO','ordered_qty_min':'95.000','ordered_qty_max':'105.000','actual_qty':'100.000' if supplied else None,'sale_price':'6000.0000','cost_price':'5600.0000'},
                {'oil':'MGO','ordered_qty_min':'45.000','ordered_qty_max':'55.000','actual_qty':'50.000' if supplied else None,'sale_price':'6200.0000','cost_price':'5800.0000'},
            ]}


class CalculationTests(SimpleTestCase):
    def test_half_up_per_line_before_sum(self):
        line = SimpleNamespace(actual_qty=Decimal('1.001'),sale_price=Decimal('5.0000'),cost_price=Decimal('2.0000'))
        result = totals([line,line], Decimal('0.0050'))
        self.assertEqual(result['sales'], Decimal('10.02'))  # 5.005 => 5.01 per row
        self.assertEqual(result['cost'], Decimal('4.00'))
        self.assertEqual(result['quantity'], Decimal('2.002'))
        self.assertEqual(result['commission'], Decimal('.01'))

    def test_due_date_status_precedence(self):
        today = date(2026,9,12)
        self.assertEqual(state(10,0,today,today,today=today),'not_due')
        self.assertEqual(state(10,1,today,today,today=today),'partial')
        self.assertEqual(state(10,1,today-timedelta(days=1),today,today=today),'overdue')
        self.assertEqual(state(0,10,today-timedelta(days=1),today,today=today),'settled')
        self.assertEqual(state(0,0,None,None,today=today),'pending')
        self.assertEqual(state(0,0,today,today,lifecycle='void',today=today),'void')


class TradingTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_user(username='finance-admin',role='admin',must_change_password=False)
        cls.operator = User.objects.create_user(username='finance-user',role='operator',must_change_password=False)
        cls.account = Account.objects.create(name='USD primary',is_default=True,opening_balance='1000000.00')

    def setUp(self):
        self.client = APIClient()
        self.client.force_authenticate(self.admin)

    def write(self,path,values,method='post',key=None,client=None):
        return getattr(client or self.client,method)('/api/trading/'+path,{**values,'request_id':key or str(uuid.uuid4())},format='json')

    def create_order(self,values=None):
        response=self.write('orders/',values or order_payload())
        self.assertEqual(response.status_code,201,response.data)
        return response.json()

    def settle(self,order,**values):
        response=self.write(f"orders/{order['id']}/settlement/",{'version':order['version'],**values})
        self.assertEqual(response.status_code,200,response.data)
        return response.json()

    def test_invoice_and_contract_pdf_downloads(self):
        order=self.create_order()
        for kind in ['invoice','contract']:
            response=self.client.get(f"/api/trading/orders/{order['id']}/{kind}/")
            self.assertEqual(response.status_code,200)
            self.assertEqual(response['Content-Type'],'application/pdf')
            self.assertIn(f'{kind}_',response['Content-Disposition'])
            self.assertTrue(response.content.startswith(b'%PDF-'))
            self.assertGreater(len(response.content),1000)
        self.assertEqual(len(SALES_TERMS),4)
        self.assertTrue(all(term.strip() for term in SALES_TERMS))

    def test_full_multiline_money_and_due_date_fixture(self):
        with patch('trading.calculations.timezone.localdate',return_value=date(2026,9,12)):
            payload=order_payload()
            payload.update(order_date='2026-09-01',actual_date='2026-09-01')
            order=self.create_order(payload)
            order=self.settle(order,customer_deposit='100000.00',customer_received='300000.00',supplier_deposit='100000.00',supplier_paid='200000.00')
            n=order['numbers']
            expected={'quantity':'150.000','sales':'910000.00','cost':'850000.00','commission':'7500.00','profit':'51350.00','receivable':'509900.00','payable':'550000.00','customer_due':'2026-09-10','supplier_due':'2026-09-15','customer_status':'overdue','supplier_status':'partial'}
            for key,value in expected.items():
                self.assertEqual(n[key],value,key)
            self.assertEqual(account_balance(self.account),Decimal('1100000.00'))
            self.assertEqual(Entry.objects.count(),4)
            self.assertEqual(OrderRevision.objects.filter(order_id=order['id']).count(),2)

    def test_order_term_descriptions_and_initial_settlements(self):
        payload=order_payload()
        payload.update(customer_term_description='月结 30 天',supplier_term_description='交货后 15 天',
                       customer_deposit='100000.00',customer_received='300000.00',
                       supplier_deposit='100000.00',supplier_paid='200000.00')
        order=self.create_order(payload)
        row=Order.objects.get(pk=order['id'])
        self.assertEqual(row.customer_term_description,'月结 30 天')
        self.assertEqual(row.supplier_term_description,'交货后 15 天')
        self.assertEqual(order['numbers']['customer_deposit'],'100000.00')
        self.assertEqual(order['numbers']['customer_received'],'300000.00')
        self.assertEqual(order['numbers']['supplier_deposit'],'100000.00')
        self.assertEqual(order['numbers']['supplier_paid'],'200000.00')
        self.assertEqual(set(Entry.objects.values_list('date',flat=True)),{row.order_date})
        self.assertEqual(account_balance(self.account),Decimal('1100000.00'))

    def test_order_links_master_data_and_keeps_name_snapshots(self):
        customer=Reference.objects.create(kind='customer',code='CUS-001',name='数据库客户')
        supplier=Reference.objects.create(kind='supplier',code='SUP-001',name='数据库供应商')
        port=Reference.objects.create(kind='port',code='POR-001',name='Shanghai')
        salesperson=Reference.objects.create(kind='salesperson',code='SAL-001',name='张三')
        oil=Reference.objects.create(kind='oil',code='OIL-001',name='VLSFO 0.5%')
        payload=order_payload()
        payload.update(customer='会被资料名称覆盖',customer_reference=customer.pk,
                       supplier='会被资料名称覆盖',supplier_reference=supplier.pk,
                       port='会被资料名称覆盖',port_reference=port.pk,
                       salesperson='会被资料名称覆盖',salesperson_reference=salesperson.pk)
        payload['lines'][0].update(oil='会被资料名称覆盖',oil_reference=oil.pk)
        order=self.create_order(payload)
        row=Order.objects.get(pk=order['id'])
        self.assertEqual((row.customer_reference_id,row.supplier_reference_id,row.port_reference_id,row.salesperson_reference_id),(customer.pk,supplier.pk,port.pk,salesperson.pk))
        self.assertEqual((row.customer,row.supplier,row.port,row.salesperson),(customer.name,supplier.name,port.name,salesperson.name))
        first_line=row.lines.get(position=0)
        self.assertEqual((first_line.oil_reference_id,first_line.oil),(oil.pk,oil.name))
        self.assertEqual(order['customer_reference'],customer.pk)
        self.assertEqual(order['lines'][0]['oil_reference'],oil.pk)

    def test_order_rejects_reference_of_wrong_kind_and_allows_manual_names(self):
        oil=Reference.objects.create(kind='oil',code='OIL-WRONG',name='Not a customer')
        invalid=dict(order_payload(),customer_reference=oil.pk)
        response=self.write('orders/',invalid)
        self.assertEqual(response.status_code,400)
        self.assertEqual(str(response.data['customer_reference'][0]),'reference_kind')
        manual=self.create_order(order_payload())
        self.assertIsNone(manual['customer_reference'])
        self.assertIsNone(manual['lines'][0]['oil_reference'])

    def test_estimated_supply_range_and_exceptional_fee(self):
        payload=order_payload()
        payload.update(estimated_start_date='2026-09-10',estimated_end_date='2026-09-12',exceptional_fee='350.00')
        order=self.create_order(payload)
        self.assertEqual(order['estimated_start_date'],'2026-09-10')
        self.assertEqual(order['estimated_end_date'],'2026-09-12')
        self.assertEqual(order['exceptional_fee'],'350.00')
        self.assertEqual(order['numbers']['profit'],'51000.00')
        for invalid in [
            dict(order_payload(),estimated_start_date='2026-09-10'),
            dict(order_payload(),estimated_end_date='2026-09-12'),
            dict(order_payload(),estimated_start_date='2026-09-13',estimated_end_date='2026-09-12'),
        ]:
            self.assertEqual(self.write('orders/',invalid).status_code,400)

    def test_initial_settlement_without_default_account_rolls_back_order(self):
        Account.objects.all().delete()
        response=self.write('orders/',dict(order_payload(),customer_deposit='10.00'))
        self.assertEqual(response.status_code,400)
        self.assertEqual(response.json()['code'],'account_required')
        self.assertFalse(Order.objects.exists())
        self.assertFalse(Entry.objects.exists())

    def test_draft_saves_without_account_and_confirms_without_posting(self):
        Account.objects.all().delete()
        payload=order_payload()
        payload.update(save_as_draft=True)
        draft=self.create_order(payload)
        self.assertEqual(draft['state'],'draft')
        self.assertFalse(Entry.objects.exists())
        confirmed=self.write(f"orders/{draft['id']}/",{'version':draft['version'],'save_as_draft':False},method='patch')
        self.assertEqual(confirmed.status_code,200,confirmed.data)
        self.assertEqual(confirmed.json()['state'],'active')
        self.assertFalse(Entry.objects.exists())

    def test_fee_net_receipt_does_not_deduct_cash_twice(self):
        payload=order_payload()
        payload['lines']=[{'oil':'Fuel','ordered_qty_min':'1.000','ordered_qty_max':'1.000','actual_qty':'1.000','sale_price':'100000.0000','cost_price':'90000.0000'}]
        order=self.create_order(payload)
        order=self.settle(order,customer_received='99900.00')
        self.assertEqual(order['numbers']['receivable'],'0.00')
        self.assertEqual(order['numbers']['customer_status'],'settled')
        self.assertEqual(account_balance(self.account),Decimal('1099900.00'))
        self.assertEqual(Entry.objects.count(),1)

    def test_request_replay_unchanged_save_and_version_conflict(self):
        order=self.create_order()
        key=str(uuid.uuid4())
        path=f"orders/{order['id']}/settlement/"
        payload={'version':order['version'],'customer_received':'100000.00'}
        first=self.write(path,payload,key=key)
        second=self.write(path,payload,key=key)
        self.assertEqual(first.status_code,200)
        self.assertEqual(first.json(),second.json())
        self.assertEqual(Entry.objects.count(),1)
        self.assertEqual(self.write(path,{**payload,'customer_received':'130000.00'},key=key).status_code,409)
        self.assertEqual(self.write(path,payload).status_code,409)
        current=first.json()
        unchanged=self.settle(current,customer_received='100000.00')
        self.assertEqual(unchanged['version'],current['version'])
        self.assertEqual(Entry.objects.count(),1)
        updated=self.settle(unchanged,customer_received='130000.00')
        self.assertEqual(Entry.objects.latest('id').amount,Decimal('30000.00'))
        self.assertEqual(updated['numbers']['customer_received'],'130000.00')

    def test_create_replay_is_single_order_and_key_is_actor_scoped(self):
        key=str(uuid.uuid4());payload=order_payload()
        first=self.write('orders/',payload,key=key)
        self.assertEqual(self.write('orders/',payload,key=key).json(),first.json())
        self.assertEqual(Order.objects.count(),1)
        other=APIClient();other.force_authenticate(self.operator)
        self.assertEqual(self.write('orders/',payload,key=key,client=other).status_code,201)
        self.assertEqual(Order.objects.count(),2)

    def test_overpayment_rolls_back_every_component_fees_revision_and_key(self):
        order=self.create_order();key=str(uuid.uuid4())
        response=self.write(f"orders/{order['id']}/settlement/",{'version':order['version'],'customer_received':'100.00','supplier_paid':'900000.00','berth_fee':'2.00'},key=key)
        self.assertEqual(response.status_code,400)
        self.assertEqual(response.json()['code'],'over_payment')
        self.assertFalse(Entry.objects.exists())
        self.assertFalse(Mutation.objects.filter(key=key).exists())
        row=Order.objects.get(pk=order['id'])
        self.assertEqual(row.berth_fee,Decimal('1000'))
        self.assertEqual(row.version,1)
        self.assertEqual(row.revisions.count(),1)
        self.assertEqual(account_balance(self.account),Decimal('1000000'))

    def test_mid_transaction_exception_rolls_back(self):
        order=self.create_order();key=str(uuid.uuid4())
        with patch('trading.services.revision',side_effect=RuntimeError('simulated failure')):
            with self.assertRaises(RuntimeError):
                self.write(f"orders/{order['id']}/settlement/",{'version':1,'customer_received':'100'},key=key)
        self.assertFalse(Entry.objects.exists())
        self.assertFalse(Mutation.objects.filter(key=key).exists())
        self.assertEqual(Order.objects.get(pk=order['id']).version,1)

    def test_correction_uses_original_accounts_then_refund_is_separate(self):
        order=self.create_order()
        order=self.settle(order,customer_received='100.00')
        second=Account.objects.create(name='Second',opening_balance=0)
        order=self.settle(order,customer_received='160.00',account_id=second.pk)
        # Changing the default must not redirect a correction to that account.
        self.account.is_default=False;self.account.save()
        third=Account.objects.create(name='New default',is_default=True)
        missing=self.write(f"orders/{order['id']}/settlement/",{'version':order['version'],'customer_received':'90.00'})
        self.assertEqual(missing.json()['code'],'reason_required')
        order=self.settle(order,customer_received='90.00',reason='Previously entered incorrectly')
        self.assertEqual(Entry.objects.filter(source='correction').count(),2)
        self.assertEqual(account_balance(second),Decimal('0'))
        self.assertEqual(account_balance(third),Decimal('0'))
        self.assertEqual(account_balance(self.account),Decimal('1000090'))
        response=self.write(f"orders/{order['id']}/refund/",{'version':order['version'],'component':'customer_received','amount':'40.00','reason':'Actual customer refund'})
        self.assertEqual(response.status_code,200,response.data)
        self.assertEqual(response.json()['numbers']['customer_received'],'50.00')
        refund=Entry.objects.get(source='refund')
        self.assertEqual(refund.account_id,self.account.pk)
        self.assertEqual(refund.direction,'expense')
        self.assertEqual(account_balance(self.account),Decimal('1000050'))
        response=self.write(f"orders/{order['id']}/refund/",{'version':response.json()['version'],'component':'customer_received','amount':'51.00','reason':'Too much'})
        self.assertEqual(response.json()['code'],'refund_exceeds_paid')
        self.assertEqual(Entry.objects.filter(source='refund').count(),1)

    def test_supplier_refund_and_correction_increase_cash(self):
        order=self.settle(self.create_order(),supplier_deposit='100.00',supplier_paid='200.00')
        order=self.settle(order,supplier_paid='150.00',reason='Correct amount')
        response=self.write(f"orders/{order['id']}/refund/",{'version':order['version'],'component':'supplier_deposit','amount':'20','reason':'Supplier returned deposit'})
        self.assertEqual(response.status_code,200,response.data)
        self.assertEqual(account_balance(self.account),Decimal('999770'))
        self.assertEqual(Entry.objects.get(source='refund').direction,'income')

    def test_pending_deposits_and_supply_validation(self):
        order=self.create_order(order_payload(False))
        self.assertEqual(order['numbers']['customer_status'],'pending')
        order=self.settle(order,customer_deposit='100.00')
        self.assertEqual(order['numbers']['receivable'],'0.00')
        response=self.write(f"orders/{order['id']}/settlement/",{'version':order['version'],'customer_received':'1.00'})
        self.assertEqual(response.json()['code'],'supply_required')
        supplied=order_payload();supplied.update(version=order['version'],reason='Supply completed')
        response=self.write(f"orders/{order['id']}/",supplied,method='patch')
        self.assertEqual(response.status_code,200,response.data)
        response=self.write(f"orders/{order['id']}/",{'version':response.json()['version'],'actual_date':None,'reason':'Clear only date'},method='patch')
        self.assertEqual(response.status_code,200,response.data)
        row=Order.objects.get(pk=order['id'])
        self.assertIsNone(row.actual_date)

    def test_edit_below_received_rolls_back_lines_and_snapshot(self):
        order=self.settle(self.create_order(),customer_received='400000.00')
        payload=order_payload()
        for line in payload['lines']:
            line['sale_price']='1.0000'
        payload.update(version=order['version'],reason='Incorrect discount')
        before=list(Order.objects.get(pk=order['id']).lines.values_list('id',flat=True))
        response=self.write(f"orders/{order['id']}/",payload,method='patch')
        self.assertEqual(response.json()['code'],'over_receipt')
        row=Order.objects.get(pk=order['id'])
        self.assertEqual(list(row.lines.values_list('id',flat=True)),before)
        self.assertEqual(row.version,order['version'])
        self.assertEqual(row.revisions.first().snapshot['numbers']['sales'],'910000.00')

    def test_negative_profit_allowed_invalid_decimal_and_non_usd_rejected(self):
        payload=order_payload()
        payload.update(customer_fee='0',supplier_fee='0',berth_fee='0',exceptional_fee='0',commission_rate='0')
        payload['lines'][0]['sale_price']='0.0000'
        order=self.create_order(payload)
        self.assertTrue(order['numbers']['profit'].startswith('-'))
        for altered in [dict(payload,currency='CNY'),dict(payload,customer_fee='-1'),dict(payload,exceptional_fee='-1'),dict(payload,lines=[])]:
            self.assertEqual(self.write('orders/',altered).status_code,400)
        precision=copy.deepcopy(payload);precision['lines'][0]['ordered_qty_min']='1.0001'
        self.assertEqual(self.write('orders/',precision).status_code,400)
        future=dict(payload,actual_date=(timezone.localdate()+timedelta(days=1)).isoformat())
        self.assertEqual(self.write('orders/',future).status_code,201)

    def test_ordered_quantity_range_and_independent_actual_fields(self):
        payload=order_payload(False)
        payload['lines'][0]['ordered_qty_min']='106.000'
        self.assertEqual(self.write('orders/',payload).status_code,400)
        payload=order_payload(False)
        payload['lines'][0]['actual_qty']='100.000'
        response=self.write('orders/',payload)
        self.assertEqual(response.status_code,201,response.data)
        payload=order_payload(False)
        payload['actual_date']=(timezone.localdate()+timedelta(days=7)).isoformat()
        response=self.write('orders/',payload)
        self.assertEqual(response.status_code,201,response.data)

    def test_manual_cash_expense_does_not_change_accrued_profit(self):
        order=self.create_order()
        response=self.write('ledger/',{'order_id':order['id'],'version':order['version'],'category':'commission','direction':'expense','amount':'7500.00','reason':'Commission paid'})
        self.assertEqual(response.status_code,201,response.data)
        row=Order.objects.get(pk=order['id'])
        self.assertEqual(order_numbers(row)['profit'],Decimal('51350.00'))
        self.assertEqual(account_balance(self.account),Decimal('992500'))
        entry=Entry.objects.get()
        response=self.write(f'ledger/{entry.pk}/reverse/',{'version':row.version,'reason':'Wrong commission payment'})
        self.assertEqual(response.status_code,200,response.data)
        self.assertEqual(account_balance(self.account),Decimal('1000000'))
        self.assertEqual(self.write(f'ledger/{entry.pk}/reverse/',{'reason':'Again'}).json()['code'],'linked_entry_protected')

    def test_manual_linked_receipt_updates_order_and_cannot_direct_reverse(self):
        order=self.create_order()
        payload={'order_id':order['id'],'version':order['version'],'category':'customer_receipt','direction':'income','amount':'120.00','component':'customer_received'}
        self.assertEqual(self.write('ledger/',payload).status_code,201)
        row=Order.objects.get(pk=order['id'])
        self.assertEqual(order_numbers(row)['customer_received'],Decimal('120'))
        self.assertEqual(self.write('ledger/',payload).status_code,409)
        entry=Entry.objects.get()
        self.assertEqual(self.write(f'ledger/{entry.pk}/reverse/',{'version':row.version,'reason':'Wrong path'}).json()['code'],'linked_entry_protected')

    def test_void_reverses_corrections_refunds_and_unreversed_manual_entries(self):
        order=self.settle(self.create_order(),customer_received='100',supplier_paid='50')
        order=self.settle(order,customer_received='80',reason='Correction')
        response=self.write(f"orders/{order['id']}/refund/",{'version':order['version'],'component':'customer_received','amount':'10','reason':'Refund'})
        order=response.json()
        self.assertEqual(self.write('ledger/',{'order_id':order['id'],'version':order['version'],'category':'berth','direction':'expense','amount':'20'}).status_code,201)
        row=Order.objects.get(pk=order['id']);entry=Entry.objects.get(source='manual')
        self.assertEqual(self.write(f'ledger/{entry.pk}/reverse/',{'version':row.version,'reason':'Wrong fee'}).status_code,200)
        row.refresh_from_db()
        self.assertEqual(self.write(f'orders/{row.pk}/delete/',{'version':row.version,'reason':'Delete'}).json()['code'],'posted_order_protected')
        response=self.write(f'orders/{row.pk}/void/',{'version':row.version,'reason':'Void mistaken business'})
        self.assertEqual(response.status_code,200,response.data)
        row.refresh_from_db()
        self.assertEqual(row.state,'void')
        self.assertEqual(account_balance(self.account),Decimal('1000000'))
        self.assertEqual(order_numbers(row)['customer_received'],Decimal('0'))
        self.assertEqual(order_numbers(row)['supplier_paid'],Decimal('0'))
        self.assertEqual(self.write(f'orders/{row.pk}/void/',{'version':row.version,'reason':'Again'}).json()['code'],'order_closed')
        self.assertEqual(self.client.get('/api/trading/dashboard/').json()['order_count'],0)

    def test_batch_delete_atomic_and_clear_snapshot_protected(self):
        first=self.create_order();second=self.settle(self.create_order(),customer_received='1')
        response=self.write('orders/bulk-delete/',{'orders':[{'id':o['id'],'version':o['version']} for o in [first,second]],'reason':'Batch'})
        self.assertEqual(response.json()['code'],'posted_order_protected')
        self.assertEqual(Order.objects.filter(state='active').count(),2)
        snapshot=self.client.get('/api/trading/orders/clear-snapshot/').json()
        third=self.create_order()
        response=self.write('orders/bulk-delete/',{'orders':snapshot,'clear_all':True,'confirmation':'CLEAR','reason':'All'})
        self.assertEqual(response.json()['code'],'clear_snapshot_changed')
        self.assertEqual(self.write(f"orders/{third['id']}/delete/",{'version':third['version'],'reason':'Mistake'}).status_code,200)
        self.assertEqual(Order.objects.get(pk=third['id']).state,'deleted')
        self.assertEqual(self.client.get(f"/api/trading/orders/{third['id']}/").status_code,404)
        self.assertTrue(OrderRevision.objects.filter(order_id=third['id'],action='deleted').exists())

    def test_account_default_opening_delete_and_permissions(self):
        response=self.write('accounts/',{'name':'New default','opening_balance':'100.00','is_default':True})
        self.assertEqual(response.status_code,201,response.data)
        second=response.json();self.account.refresh_from_db()
        self.assertTrue(self.account.is_default)
        self.assertFalse(second['is_default'])
        response=self.write(f"accounts/{second['id']}/",{'version':second['version'],'is_default':True},method='patch')
        self.assertEqual(response.status_code,200,response.data)
        second=response.json();self.account.refresh_from_db()
        self.assertFalse(self.account.is_default)
        self.assertEqual(Account.objects.filter(is_default=True).count(),1)
        self.settle(self.create_order(),customer_received='10')
        response=self.write(f"accounts/{second['id']}/",{'version':second['version'],'opening_balance':'200'},method='patch')
        self.assertEqual(response.json()['code'],'opening_locked')
        self.assertEqual(self.write(f"accounts/{second['id']}/",{'version':second['version']}).json()['code'],'account_has_entries')
        response=self.write('accounts/',{'name':'CNY cash','account_type':'cash','currency':'CNY','opening_balance':'200.00'})
        self.assertEqual(response.status_code,201,response.data)
        self.assertEqual(response.json()['account_type'],'cash')
        self.assertEqual(response.json()['currency'],'CNY')
        self.assertFalse(response.json()['is_default'])
        self.assertEqual(Account.objects.filter(is_default=True).count(),1)
        response=self.client.get('/api/trading/accounts/').json()
        self.assertEqual(response['totals_by_currency']['CNY'],'200.00')
        cny=Account.objects.get(name='CNY cash')
        response=self.write(f"accounts/{cny.pk}/",{'version':cny.version,'is_default':True},method='patch')
        self.assertEqual(response.status_code,200,response.data)
        self.assertEqual(Account.objects.filter(is_default=True).count(),1)
        self.assertTrue(Account.objects.get(pk=cny.pk).is_default)
        order=self.create_order()
        response=self.write(f"orders/{order['id']}/settlement/",{'version':order['version'],'account_id':cny.pk,'customer_received':'10'})
        self.assertEqual(response.json()['code'],'account_currency_mismatch')
        self.client.force_authenticate(self.operator)
        self.assertEqual(self.write('accounts/',{'name':'Forbidden'}).status_code,403)
        order=self.create_order()
        self.assertEqual(self.write(f"orders/{order['id']}/delete/",{'version':1,'reason':'Forbidden'}).status_code,403)
        self.assertEqual(self.client.get('/api/trading/accounts/').status_code,200)
        self.client.force_authenticate(None)
        for path in ['orders/','accounts/','ledger/','ledger/export/','dashboard/','forecast/']:
            self.assertEqual(self.client.get('/api/trading/'+path).status_code,403,path)

    def test_account_reconciliation_is_derived_from_persisted_ledger(self):
        order=self.create_order()
        self.settle(order,customer_received='100.00',supplier_paid='40.00')
        data=self.client.get('/api/trading/accounts/').json()['results'][0]
        self.assertEqual(data['opening_balance'],'1000000.00')
        self.assertEqual(data['ledger_income'],'100.00')
        self.assertEqual(data['ledger_expense'],'40.00')
        self.assertEqual(data['expected_balance'],'1000060.00')
        self.assertEqual(data['balance'],'1000060.00')
        self.assertEqual(data['opening_difference'],'0.00')
        self.assertTrue(data['reconciled'])

    def test_cash_forecast_uses_open_database_balances_without_posting(self):
        order=self.create_order()
        before_entries=Entry.objects.count()
        response=self.client.get('/api/trading/forecast/',{'cutoff':(timezone.localdate()+timedelta(days=40)).isoformat()})
        self.assertEqual(response.status_code,200,response.data)
        data=response.json()
        self.assertEqual(data['current_balance'],'1000000.00')
        self.assertEqual({row['side'] for row in data['results']},{'customer','supplier'})
        customer=next(row for row in data['results'] if row['side']=='customer')
        supplier=next(row for row in data['results'] if row['side']=='supplier')
        self.assertEqual(customer['amount'],'909900.00')
        self.assertEqual(supplier['amount'],'850000.00')
        self.assertEqual(Entry.objects.count(),before_entries)
        self.assertEqual(Order.objects.get(pk=order['id']).version,order['version'])

    def test_first_account_is_default_and_inactive_account_not_postable(self):
        Account.objects.all().delete()
        response=self.write('accounts/',{'name':'First','is_default':False,'opening_balance':'0'})
        self.assertEqual(response.status_code,201,response.data)
        self.assertTrue(response.json()['is_default'])
        inactive=Account.objects.create(name='Inactive',is_active=False)
        order=self.create_order()
        response=self.write(f"orders/{order['id']}/settlement/",{'version':1,'account_id':inactive.pk,'customer_received':'10'})
        self.assertEqual(response.json()['code'],'account_required')
        self.assertFalse(Entry.objects.exists())

    def test_order_filters_summary_and_ledger_export(self):
        order=self.settle(self.create_order(),customer_received='100')
        pending=self.create_order(order_payload(False))
        response=self.client.get('/api/trading/orders/',{'customer':'客户 A','supplier':'供应商 A','port':'Singapore','oil':'MGO','salesperson':'李明','state':'fulfilled','settlement_scope':'partial'})
        self.assertEqual(response.json()['count'],1)
        self.assertEqual(response.json()['summary']['sales'],'910000.00')
        self.assertEqual(response.json()['summary']['partial_receipts'],1)
        self.assertEqual(self.client.get('/api/trading/orders/',{'state':'pending'}).json()['results'][0]['id'],pending['id'])
        self.assertEqual(self.client.get('/api/trading/ledger/',{'direction':'income','account':self.account.pk}).json()['net'],'100.00')
        self.assertEqual(self.write('ledger/',{'category':'other_income','direction':'income','amount':'5.50','reason':'=HYPERLINK("malicious")'}).status_code,201)
        ns={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
        for language,header in [('en','Date'),('zh-CN','日期')]:
            response=self.client.get('/api/trading/ledger/export/',{'language':language,'direction':'income'})
            self.assertEqual(response.status_code,200)
            with ZipFile(BytesIO(response.content)) as archive:
                sheet=ElementTree.fromstring(archive.read('xl/worksheets/sheet1.xml'))
                self.assertEqual(sheet.find('.//s:t',ns).text,header)
                self.assertEqual(sheet.findall('.//s:f',ns),[])
                texts=[node.text for node in sheet.findall('.//s:t',ns)]
                self.assertIn('=HYPERLINK("malicious")',texts)
                summary=ElementTree.fromstring(archive.read('xl/worksheets/sheet2.xml'))
                self.assertIn('105.50',[node.text for node in summary.findall('.//s:v',ns)])

    def test_csrf_is_enforced_on_trading_write(self):
        client=APIClient(enforce_csrf_checks=True)
        client.force_login(self.admin)
        session=client.session
        session.update(activity=timezone.now().timestamp(),version=self.admin.session_version)
        session.save()
        self.assertEqual(self.write('orders/',order_payload(),client=client).status_code,403)


class ConcurrentPostingTests(TransactionTestCase):
    @skipUnlessDBFeature('has_select_for_update')
    def test_two_writers_same_version_only_one_posts(self):
        admin=User.objects.create_user(username='concurrent-admin',role='admin',must_change_password=False)
        account=Account.objects.create(name='Concurrency',is_default=True)
        client=APIClient();client.force_authenticate(admin)
        created=client.post('/api/trading/orders/',{**order_payload(),'request_id':str(uuid.uuid4())},format='json')
        self.assertEqual(created.status_code,201,created.data)
        order=created.json();barrier=Barrier(2)
        WriteLock.objects.get_or_create(pk=1)
        def post(amount):
            close_old_connections()
            try:
                actor=User.objects.get(pk=admin.pk)
                worker=APIClient();worker.force_authenticate(actor)
                barrier.wait(timeout=10)
                return worker.post(f"/api/trading/orders/{order['id']}/settlement/",{'version':1,'customer_received':amount,'request_id':str(uuid.uuid4())},format='json').status_code
            finally:
                close_old_connections()
        with ThreadPoolExecutor(max_workers=2) as executor:
            results=list(executor.map(post,['100.00','130.00']))
        self.assertEqual(sorted(results),[200,409])
        self.assertEqual(Entry.objects.count(),1)
        self.assertEqual(Order.objects.get(pk=order['id']).version,2)
        self.assertIn(account_balance(account),[Decimal('100'),Decimal('130')])

