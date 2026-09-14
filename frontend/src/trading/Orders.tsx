import {useState} from 'react';
import {Button,Card,Dropdown,Form,Input,Select,Space,Table} from 'antd';
import {DeleteOutlined,EditOutlined,FileDoneOutlined,FileExcelOutlined,FilePdfOutlined,MoreOutlined} from '@ant-design/icons';
import type {ColumnsType} from 'antd/es/table';
import {useTranslation} from 'react-i18next';
import {useAuth} from '../auth';
import {api} from '../api';
import {ErrorBox} from '../components';
import {cash,Metrics,query,ReasonDialog,Status,useCommand,useResource} from './shared';
import {OrderDetail,OrderEditor,SettlementEditor} from './OrderForms';
import type {Order,OrderList} from './types';

export default function Orders({settlements=false}:{settlements?:boolean}){
 const {t}=useTranslation();const {user}=useAuth();const [filters,setFilters]=useState<Record<string,unknown>>({state:'active'}),[page,setPage]=useState(1),[selected,setSelected]=useState<Order[]>([]);
 const [filterForm]=Form.useForm();
 const r=useResource<OrderList>('trading/orders/?'+query({...filters,page}));const cmd=useCommand();const [error,setError]=useState('');
 const [editor,setEditor]=useState<Order|'new'|null>(null),[payment,setPayment]=useState<{order:Order;refund:boolean}|null>(null),[detail,setDetail]=useState<Order|null>(null);
 const [closing,setClosing]=useState<{action:'delete'|'void'|'bulk'|'clear';rows:{id:number;version:number}[]}|null>(null);
 const refresh=()=>{r.refresh();setSelected([]);};
 const columns:ColumnsType<Order>=[
 {title:t('biz.number'),dataIndex:'number',fixed:'left',width:195,render:(v:string,o:Order)=><Button type="link" onClick={()=>setDetail(o)}>{v}</Button>},
 ...['order_date','customer','vessel','supplier','port'].map(key=>({title:t(`biz.${key}`),dataIndex:key,width:145})),
 {title:t('biz.oil'),width:150,render:(_:unknown,o:Order)=>o.lines.map(l=>l.oil).join(' / ')},
 ...(!settlements?['sales','cost','commission','profit']:['customer_deposit','customer_received','supplier_deposit','supplier_paid']).map(key=>({title:t(`biz.${key}`),width:160,render:(_:unknown,o:Order)=>cash(o.numbers[key as keyof Order['numbers']])})),
 ...['receivable','payable'].map(key=>({title:t(`biz.${key}`),width:160,render:(_:unknown,o:Order)=>cash(o.numbers[key as 'receivable'|'payable'])})),
 ...['customer_due','supplier_due'].map(key=>({title:t(`biz.${key}`),width:130,render:(_:unknown,o:Order)=>o.numbers[key as 'customer_due'|'supplier_due']||'—'})),
 ...['customer_status','supplier_status'].map(key=>({title:t(`biz.${key}`),width:130,render:(_:unknown,o:Order)=><Status value={o.numbers[key as 'customer_status'|'supplier_status']}/>})),
 {title:t('biz.action'),width:settlements?330:230,fixed:'right',render:(_:unknown,o:Order)=><div className="order-row-actions">
 {o.state==='active'&&(settlements?<Space size={6}>
  <Button size="small" type="primary" onClick={()=>setPayment({order:o,refund:false})}>{t('biz.recordPayment')}</Button>
  <Button size="small" onClick={()=>setPayment({order:o,refund:true})}>{t('biz.refundAction')}</Button>
  {user?.role==='admin'&&<Button size="small" danger onClick={()=>setClosing({action:'void',rows:[o]})}>{t('biz.voidAction')}</Button>}
 </Space>:<Space size={6}>
  <Button size="small" icon={<EditOutlined/>} onClick={()=>setEditor(o)}>{t('biz.edit')}</Button>
  <Button size="small" danger icon={<DeleteOutlined/>} disabled={user?.role!=='admin'} title={user?.role==='admin'?undefined:t('biz.adminDeleteOnly')} onClick={()=>setClosing({action:'delete',rows:[o]})}>{t('biz.delete')}</Button>
  <Dropdown trigger={['click']} menu={{items:[
   {key:'export-order',icon:<FileExcelOutlined/>,label:t('biz.exportOrderExcel'),disabled:true},
   {key:'export-contract',icon:<FilePdfOutlined/>,label:t('biz.exportContract'),disabled:true},
   {key:'issue-invoice',icon:<FileDoneOutlined/>,label:t('biz.issueInvoice'),disabled:true},
  ]}}><Button size="small" icon={<MoreOutlined/>}>{t('biz.moreActions')}</Button></Dropdown>
 </Space>)}
 {o.state!=='active'&&<Status value={o.state}/>}</div>},
 ];
 return <>
 <div className="page-heading"><div className="eyebrow">MARINE TRADE · USD</div><h1>{t(settlements?'biz.settlements':'biz.orders')}</h1><p>{t('biz.amountsHint')}</p></div>
 {r.data&&<Metrics data={r.data.summary} keys={settlements?['receivable','payable','customer_overdue','supplier_overdue','partial_receipts','net_expected']:['order_count','pending_count','sales','cost','commission','profit']}/>}
 <Card><Form form={filterForm} layout="inline" className="business-filters" initialValues={{state:'active'}} onFinish={values=>{setFilters(values);setPage(1);setSelected([]);}}>
 {['q','customer','supplier','port','oil','salesperson'].map(key=><Form.Item key={key} name={key} label={t(`biz.${key==='q'?'query':key}`)}><Input allowClear/></Form.Item>)}
 {['date_from','date_to'].map(key=><Form.Item key={key} name={key} label={t(`biz.${key}`)}><Input type="date"/></Form.Item>)}
 <Form.Item name="state" label={t('biz.supplyState')}><Select allowClear style={{width:140}} options={['active','pending','fulfilled','void'].map(value=>({value,label:t(`biz.${value}`)}))}/></Form.Item>
 {['customer_status','supplier_status'].map(key=><Form.Item key={key} name={key} label={t(`biz.${key}`)}><Select allowClear style={{width:140}} options={['pending','not_due','partial','overdue','settled'].map(value=>({value,label:t(`biz.${value}`)}))}/></Form.Item>)}
 {settlements&&<Form.Item name="settlement_scope" label={t('biz.filter')}><Select allowClear style={{width:140}} options={['partial','overdue','settled'].map(value=>({value,label:t(`biz.${value}`)}))}/></Form.Item>}
 <Form.Item><Button htmlType="submit" type="primary">{t('biz.filter')}</Button></Form.Item>
 <Form.Item><Button onClick={()=>{filterForm.resetFields();filterForm.setFieldValue('state',undefined);setFilters({});setPage(1);setSelected([]);}}>{t('biz.reset')}</Button></Form.Item>
 </Form></Card>
 <div className="business-toolbar"><Button type="primary" onClick={()=>setEditor('new')}>{t('biz.createOrder')}</Button>
 {user?.role==='admin'&&<Space><Button danger disabled={!selected.length} onClick={()=>setClosing({action:'bulk',rows:selected})}>{t('biz.deleteSelected')} ({selected.length})</Button><Button danger onClick={async()=>{setError('');try{const rows=await api<{id:number;version:number}[]>('trading/orders/clear-snapshot/');if(rows.length)setClosing({action:'clear',rows});}catch(e){setError((e as Error).message);}}}>{t('biz.clearAll')}</Button></Space>}</div>
 <ErrorBox error={r.error||error} retry={r.refresh}/>
 <Table<Order> rowKey="id" loading={r.loading} dataSource={r.data?.results} columns={columns} scroll={{x:2300}} rowSelection={user?.role==='admin'?{selectedRowKeys:selected.map(o=>o.id),onChange:(_,rows)=>setSelected(rows),getCheckboxProps:o=>({disabled:o.state!=='active'})}:undefined} pagination={{current:page,pageSize:20,total:r.data?.count,showSizeChanger:false,onChange:value=>{setPage(value);setSelected([]);}}}/>
 {editor&&<OrderEditor order={editor==='new'?undefined:editor} onClose={()=>setEditor(null)} onSaved={refresh}/>}
 {payment&&<SettlementEditor {...payment} onClose={()=>setPayment(null)} onSaved={refresh}/>}
 {detail&&<OrderDetail order={detail} onClose={()=>setDetail(null)}/>}
 {closing&&<ReasonDialog title={t(`biz.${closing.action==='void'?'voidAction':closing.action==='clear'?'clearAll':'delete'}`)} hint={t(closing.action==='void'?'biz.voidHint':closing.action==='clear'?'biz.clearHint':'biz.deleteHint')} clear={closing.action==='clear'} date={closing.action==='void'} onClose={()=>setClosing(null)} onSubmit={async values=>{
  const bulk=['bulk','clear'].includes(closing.action);
  await cmd.send(bulk?'trading/orders/bulk-delete/':`trading/orders/${closing.rows[0].id}/${closing.action}/`,bulk?{...values,orders:closing.rows.map(({id,version})=>({id,version})),clear_all:closing.action==='clear'}:{...values,version:closing.rows[0].version});refresh();
 }}/>} </>;
}

